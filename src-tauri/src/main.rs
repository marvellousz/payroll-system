// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::Child;
#[cfg(not(debug_assertions))]
use std::fs::File;
#[cfg(not(debug_assertions))]
use std::io::{BufRead, BufReader};
#[cfg(not(debug_assertions))]
use std::net::TcpStream;
#[cfg(not(debug_assertions))]
use std::path::{Path, PathBuf};
#[cfg(not(debug_assertions))]
use std::process::{Command, Stdio};
use std::sync::Mutex;
#[cfg(not(debug_assertions))]
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

struct ServerProcess(Mutex<Option<Child>>);

#[cfg(not(debug_assertions))]
/// Strip Windows `\\?\` verbatim prefix — Node cannot resolve it.
fn strip_verbatim(p: PathBuf) -> PathBuf {
    let s = p.to_string_lossy();
    match s.strip_prefix(r"\\?\") {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

#[cfg(not(debug_assertions))]
fn find_free_port() -> u16 {
    std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(47821)
}

#[cfg(not(debug_assertions))]
fn wait_for_port(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(150));
    }
    false
}

#[cfg(not(debug_assertions))]
fn load_dotenv(path: &Path) -> Vec<(String, String)> {
    let mut out = Vec::new();
    let Ok(file) = File::open(path) else {
        return out;
    };
    for line in BufReader::new(file).lines().flatten() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let Some((k, v)) = line.split_once('=') else {
            continue;
        };
        let mut val = v.trim().to_string();
        if (val.starts_with('"') && val.ends_with('"'))
            || (val.starts_with('\'') && val.ends_with('\''))
        {
            val = val[1..val.len() - 1].to_string();
        }
        out.push((k.trim().to_string(), val));
    }
    out
}

#[cfg(not(debug_assertions))]
fn start_server(app: &tauri::App, port: u16) -> Result<(), Box<dyn std::error::Error>> {
    let resource_dir = strip_verbatim(app.path().resource_dir()?);
    let app_data = strip_verbatim(app.path().app_data_dir()?);
    std::fs::create_dir_all(&app_data)?;

    #[cfg(windows)]
    let node = resource_dir.join("node.exe");
    #[cfg(not(windows))]
    let node = resource_dir.join("node");

    let server_dir = resource_dir.join("server");
    let server_js = server_dir.join("server.js");
    let env_file = server_dir.join(".env");

    if !node.exists() {
        return Err(format!("Bundled Node runtime missing at {}", node.display()).into());
    }
    if !server_js.exists() {
        return Err(format!("Bundled server missing at {}", server_js.display()).into());
    }

    let log = File::create(app_data.join("server.log"))?;
    let log_err = log.try_clone()?;

    let mut cmd = Command::new(&node);
    cmd.arg(&server_js)
        .current_dir(&server_dir)
        .env("NODE_ENV", "production")
        .env("HOSTNAME", "127.0.0.1")
        .env("PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log))
        .stderr(Stdio::from(log_err));

    for (k, v) in load_dotenv(&env_file) {
        cmd.env(k, v);
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let child = cmd.spawn()?;
    *app.state::<ServerProcess>().0.lock().unwrap() = Some(child);
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(ServerProcess(Mutex::new(None)))
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let handle = app.handle().clone();
                WebviewWindowBuilder::new(
                    &handle,
                    "main",
                    WebviewUrl::External("http://localhost:3000".parse().unwrap()),
                )
                .title("Payroll — Attendance Platform")
                .inner_size(1280.0, 800.0)
                .min_inner_size(360.0, 640.0)
                .center()
                .build()?;
            }

            #[cfg(not(debug_assertions))]
            {
                let port = find_free_port();
                start_server(app, port)?;
                if !wait_for_port(port, Duration::from_secs(90)) {
                    return Err(
                        "Payroll server failed to start (see server.log in app data)".into(),
                    );
                }

                let url = format!("http://127.0.0.1:{port}");
                let handle = app.handle().clone();
                WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(url.parse().unwrap()))
                    .title("Payroll — Attendance Platform")
                    .inner_size(1280.0, 800.0)
                    .min_inner_size(360.0, 640.0)
                    .center()
                    .build()?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Payroll")
        .run(|app_handle, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                if let Some(state) = app_handle.try_state::<ServerProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                            let _ = child.wait();
                        }
                    }
                }
            }
        });
}
