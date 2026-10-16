#!/usr/bin/env python3
"""Eenvoudige web-interface (alleen lokaal): python server.py -> http://127.0.0.1:8000"""
import json
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

from downloader import DEFAULT_DIR, download

JOBS = {}

PAGE = """<!doctype html><html lang="nl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>YouTube Downloader</title>
<style>
body{font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;padding:0 16px}
input[type=text]{width:100%;padding:10px;font-size:16px;box-sizing:border-box}
button{padding:10px 18px;font-size:16px;margin-top:10px;cursor:pointer}
label{margin-right:14px}.job{border:1px solid #ccc;border-radius:8px;padding:10px;margin-top:12px}
.err{color:#b00}
</style>
<h1>YouTube Downloader</h1>
<input id="url" type="text" placeholder="Plak YouTube-link...">
<p><label><input type="radio" name="m" value="mkv" checked> Video MKV (hoogste kwaliteit)</label>
<label><input type="radio" name="m" value="mp4"> Video MP4</label>
<label><input type="radio" name="m" value="audio"> Alleen audio (MP3)</label></p>
<button onclick="go()">Download</button>
<div id="jobs"></div>
<script>
async function go(){
  const url=document.getElementById('url').value.trim();
  const el=document.createElement('div');el.className='job';
  document.getElementById('jobs').prepend(el);
  if(!url){el.innerHTML='<span class=err>Plak eerst een YouTube-link.</span>';return;}
  el.textContent='Starten...';
  const m=document.querySelector('input[name=m]:checked').value;
  try{
    const r=await fetch('/api/download',{method:'POST',body:JSON.stringify({url,mode:m})});
    const d=await r.json();
    if(!r.ok||!d.id){el.innerHTML='<span class=err>Fout: '+(d.error||r.status)+'</span>';return;}
    poll(d.id,el);
  }catch(e){el.innerHTML='<span class=err>Kan de downloader niet bereiken. Staat het zwarte venster nog open? ('+e+')</span>';}
}
function poll(id,el){
  const t=setInterval(async()=>{
    try{
      const j=await (await fetch('/api/job/'+id)).json();
      if(j.status==='done'){clearInterval(t);el.innerHTML='Klaar: <a href="/files/'+encodeURIComponent(j.file)+'">'+j.file+'</a>';}
      else if(j.status==='error'){clearInterval(t);el.innerHTML='<span class=err>Fout: '+j.error+'</span>';}
      else el.textContent=(j.progress||'Bezig...');
    }catch(e){clearInterval(t);el.innerHTML='<span class=err>Verbinding verbroken ('+e+')</span>';}
  },800);
}
</script></html>"""


def run_job(job_id, url, mode):
    job = JOBS[job_id]

    def hook(d):
        if d["status"] == "downloading":
            job["progress"] = f"Downloaden {d.get('_percent_str','').strip()} {d.get('_speed_str','').strip()}"
        elif d["status"] == "finished":
            job["progress"] = "Samenvoegen..."

    try:
        path = download(url, DEFAULT_DIR, mode == "audio", "mp4" if mode == "mp4" else "mkv", hook)
        job.update(status="done", file=Path(path).name)
    except Exception as e:
        print(f"Fout bij {url}: {e}", flush=True)
        job.update(status="error", error=str(e))


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="text/html; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            self._send(200, PAGE.encode())
        elif path.startswith("/api/job/"):
            job = JOBS.get(path.rsplit("/", 1)[1], {"status": "error", "error": "onbekende job"})
            self._send(200, json.dumps(job).encode(), "application/json")
        elif path.startswith("/files/"):
            f = (DEFAULT_DIR / Path(unquote(path[7:])).name)
            if not f.is_file():
                return self._send(404, b"niet gevonden", "text/plain")
            self._send(200, f.read_bytes(), "application/octet-stream",
                       {"Content-Disposition": "attachment; filename*=UTF-8''" + quote(f.name)})
        else:
            self._send(404, b"niet gevonden", "text/plain")

    def do_POST(self):
        if urlparse(self.path).path != "/api/download":
            return self._send(404, b"", "text/plain")
        data = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        url = str(data.get("url", ""))
        if not url.startswith(("http://", "https://")):
            return self._send(400, b'{"error":"ongeldige url"}', "application/json")
        job_id = uuid.uuid4().hex
        JOBS[job_id] = {"status": "running"}
        threading.Thread(target=run_job, args=(job_id, url, data.get("mode", "mkv")), daemon=True).start()
        self._send(200, json.dumps({"id": job_id}).encode(), "application/json")


if __name__ == "__main__":
    # Zonder venster (pythonw) bestaat er geen console: schrijf dan naar een logbestand.
    if sys.stdout is None or sys.stderr is None:
        log = open(Path(__file__).parent / "server.log", "a", encoding="utf-8", buffering=1)
        sys.stdout = sys.stderr = log
    # Alleen op localhost, zodat niemand anders je downloader kan gebruiken.
    try:
        srv = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    except OSError:
        print("Poort 8000 is al in gebruik - de downloader draait waarschijnlijk al.")
        sys.exit(0)
    print("Open http://127.0.0.1:8000")
    srv.serve_forever()
