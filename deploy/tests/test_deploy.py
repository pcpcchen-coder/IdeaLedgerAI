"""T11 本機部署腳本：暫存資料夾當 HOME、假 launchctl，不真的安裝。"""
import os
import plistlib
import re
import subprocess
import sys
from pathlib import Path

import pytest

DEPLOY = Path(__file__).resolve().parents[1]
REPO = DEPLOY.parent
LABELS = ["com.idealedger.collector", "com.idealedger.summarizer", "com.idealedger.statusbar"]
SCRIPTS = {"com.idealedger.collector": "run-collector.sh", "com.idealedger.summarizer": "run-summarizer.sh",
           "com.idealedger.statusbar": "run-statusbar.sh"}


@pytest.fixture
def env(tmp_path):
    home = tmp_path / "home"
    home.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    log = tmp_path / "launchctl.log"
    fake = bin_dir / "launchctl"
    fake.write_text(f'#!/bin/bash\necho "$@" >> "{log}"\n')
    fake.chmod(0o755)
    e = {
        **os.environ,
        "HOME": str(home),
        "LAUNCHCTL": str(fake),
        "PYTHON": sys.executable,
        "SKIP_PIP": "1",
    }
    e.pop("IDEALEDGER_HOME", None)
    e.pop("LAUNCH_AGENTS_DIR", None)
    return {"env": e, "home": home, "log": log, "tmp": tmp_path}


def run(script, env, extra=None, check=True):
    proc = subprocess.run(["bash", str(DEPLOY / script)], env={**env["env"], **(extra or {})},
                          capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise AssertionError(proc.stdout + proc.stderr)
    return proc


def data_dir(env):
    return env["home"] / "Library/Application Support/IdeaLedger"


def read_env(env):
    return (data_dir(env) / ".env").read_text()


def test_install_creates_env_and_plists(env):
    run("install.sh", env)
    text = read_env(env)
    token = re.search(r"^IDEA_TOKEN=(\w+)$", text, re.M).group(1)
    assert len(token) == 48
    assert f'IDEA_DB="{data_dir(env)}/ledger.db"' in text
    assert f'IDEA_MEMORY_REPO="{data_dir(env)}/AiMemory"' in text
    assert oct((data_dir(env) / ".env").stat().st_mode & 0o777) == "0o600"
    assert (data_dir(env) / "logs").is_dir()

    for label in LABELS:
        plist = plistlib.loads((env["home"] / f"Library/LaunchAgents/{label}.plist").read_bytes())
        assert plist["Label"] == label
        script = plist["ProgramArguments"][1]
        assert Path(script).is_absolute() and Path(script).exists()
        assert script.endswith(SCRIPTS[label])
        assert plist["EnvironmentVariables"]["IDEALEDGER_HOME"] == str(data_dir(env))
        assert plist["StandardOutPath"].startswith(str(data_dir(env)))
    collector = plistlib.loads((env["home"] / "Library/LaunchAgents/com.idealedger.collector.plist").read_bytes())
    summarizer = plistlib.loads((env["home"] / "Library/LaunchAgents/com.idealedger.summarizer.plist").read_bytes())
    assert collector["KeepAlive"] is True
    assert summarizer["StartInterval"] == 300
    statusbar = plistlib.loads((env["home"] / "Library/LaunchAgents/com.idealedger.statusbar.plist").read_bytes())
    assert statusbar["KeepAlive"] == {"SuccessfulExit": False}  # 當機重開；從選單結束則不重開
    assert statusbar["LimitLoadToSessionType"] == "Aqua"        # 只在登入的桌面工作階段執行

    calls = env["log"].read_text().splitlines()
    uid = os.getuid()
    for label in LABELS:
        assert f"bootout gui/{uid}/{label}" in calls
        assert any(c.startswith(f"bootstrap gui/{uid} ") and c.endswith(f"{label}.plist") for c in calls)


def test_install_retries_bootstrap_after_bootout(env):
    """T27 實際遇到：bootout 後馬上 bootstrap 回 EIO，要重試而不是讓整個安裝失敗。"""
    flaky = env["tmp"] / "bin/launchctl"
    count = env["tmp"] / "count"
    flaky.write_text(f'''#!/bin/bash
echo "$@" >> "{env["log"]}"
if [ "$1" = bootstrap ]; then
  n=$(( $(cat "{count}" 2>/dev/null || echo 0) + 1 )); echo $n > "{count}"
  [ $n -le 2 ] && {{ echo "Bootstrap failed: 5: Input/output error" >&2; exit 5; }}
fi
exit 0
''')
    proc = run("install.sh", env)
    assert proc.stdout.count("已載入：") == len(LABELS)
    assert sum(c.startswith("bootstrap") for c in env["log"].read_text().splitlines()) == len(LABELS) + 2


def test_install_reuses_t08_token(env):
    data_dir(env).mkdir(parents=True, exist_ok=True)
    (data_dir(env) / "collector_token.txt").write_text("t08TestToken1234567890abcdefABCD\n")
    run("install.sh", env)
    assert "IDEA_TOKEN=t08TestToken1234567890abcdefABCD\n" in read_env(env)


def test_reinstall_keeps_env_and_token(env):
    run("install.sh", env)
    first = read_env(env)
    (data_dir(env) / ".env").write_text(first.replace("LLM_MODEL=", "LLM_MODEL=my-model"))
    run("install.sh", env)
    assert "LLM_MODEL=my-model" in read_env(env)
    assert re.search(r"^IDEA_TOKEN=\w+$", read_env(env), re.M).group(0) in first


@pytest.mark.parametrize("folder", ["Documents", "Desktop", "Library/Mobile Documents/com~apple~CloudDocs"])
def test_refuses_icloud_paths(env, folder):
    run("install.sh", env)
    bad = env["home"] / folder / "ledger.db"
    text = re.sub(r"^IDEA_DB=.*$", f'IDEA_DB="{bad}"', read_env(env), flags=re.M)
    (data_dir(env) / ".env").write_text(text)
    proc = run("install.sh", env, check=False)
    assert proc.returncode != 0
    assert "iCloud" in proc.stderr


def test_run_scripts_load_env_and_bind_localhost(env):
    run("install.sh", env)
    stub = env["tmp"] / "python-stub"
    out = env["tmp"] / "stub.out"
    stub.write_text(f'#!/bin/bash\n{{ echo "PWD=$PWD"; echo "ARGS=$*"; echo "TOKEN=$IDEA_TOKEN"; echo "DB=$IDEA_DB"; '
                    f'echo "STATUS=$IDEA_STATUS_FILE"; echo "REPO=$IDEALEDGER_REPO"; }} >> "{out}"\n')
    stub.chmod(0o755)
    extra = {"IDEALEDGER_PYTHON": str(stub)}
    run("run-collector.sh", env, extra)
    run("run-summarizer.sh", env, extra)
    run("run-statusbar.sh", env, extra)
    lines = out.read_text().splitlines()
    token = re.search(r"^IDEA_TOKEN=(\w+)$", read_env(env), re.M).group(1)
    assert lines[0] == f"PWD={REPO / 'collector'}"
    assert lines[1] == "ARGS=-m uvicorn app.main:app --host 127.0.0.1 --port 8787"
    assert lines[2] == f"TOKEN={token}"
    assert lines[3] == f"DB={data_dir(env)}/ledger.db"  # 路徑含空白也正確讀取
    assert lines[6] == f"PWD={REPO}"
    assert lines[7] == "ARGS=-m summarizer"
    status_file = f"STATUS={data_dir(env)}/summarizer_status.json"
    assert lines[10] == status_file
    assert lines[12:16] == [f"PWD={REPO}", "ARGS=-m statusbar", lines[2], lines[3]]
    assert lines[16] == status_file  # 兩邊讀寫同一個狀態檔
    assert lines[17] == f"REPO={REPO}"


def test_run_script_without_env_fails_clearly(env):
    proc = run("run-summarizer.sh", env, check=False)
    assert proc.returncode != 0
    assert "install.sh" in proc.stderr


def test_uninstall_keeps_data(env):
    run("install.sh", env)
    run("uninstall.sh", env)
    for label in LABELS:
        assert not (env["home"] / f"Library/LaunchAgents/{label}.plist").exists()
    assert (data_dir(env) / ".env").exists()


def test_python_version_check(env, tmp_path):
    old = tmp_path / "python-old"
    old.write_text('#!/bin/bash\nif [ "$1" = "--version" ]; then echo "Python 3.9.6"; exit 0; fi\nexit 1\n')
    old.chmod(0o755)
    proc = run("install.sh", env, {"PYTHON": str(old)}, check=False)
    assert proc.returncode != 0
    assert "3.12" in proc.stderr


def test_doctor_reports_missing_settings(env):
    proc = run("doctor.sh", env, check=False)
    assert proc.returncode != 0 and "install.sh" in proc.stderr
    run("install.sh", env)
    proc = run("doctor.sh", env, check=False)
    assert proc.returncode == 1
    assert "✅ collector token 已設定" in proc.stdout
    assert "✅ 使用者輸入模式" in proc.stdout and "LiteLLM" not in proc.stdout
    assert "❌ AiMemory clone 不存在" in proc.stdout


def test_no_bare_variable_before_non_ascii():
    """macOS 內建 bash 3.2 會把 $VAR 後面緊接的中文位元組當成變數名稱的一部分（T11 實機發現），一律寫成 ${VAR}。"""
    import re as _re
    root = Path(__file__).resolve().parents[1]
    bad = []
    for f in sorted(root.glob("*.sh")):
        for n, line in enumerate(f.read_text(encoding="utf-8").splitlines(), 1):
            if _re.search(r"\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]", line):
                bad.append(f"{f.name}:{n}")
    assert bad == []
