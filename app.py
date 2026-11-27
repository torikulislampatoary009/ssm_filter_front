"""Spam SMS Filter - frontend (Flask).

Serves the web page and forwards /api/* calls to the backend, so the browser only
ever talks to this server (no CORS setup needed).

Run locally:   python app.py        ->  http://localhost:8000
Production:    gunicorn app:app --workers 2 --timeout 120
"""
import os

import requests
from dotenv import load_dotenv
from flask import Flask, Response, jsonify, render_template, request

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))

BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000").rstrip("/")

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/healthz")
def healthz():
    return jsonify({"status": "ok", "backend": BACKEND_URL})


@app.route("/api/<path:path>", methods=["GET", "POST", "DELETE"])
def proxy(path):
    try:
        upstream = requests.request(
            request.method, f"{BACKEND_URL}/api/{path}",
            params=request.args,
            json=request.get_json(silent=True) if request.method == "POST" else None,
            timeout=90,  # a sleeping free-tier backend can take ~1 minute to wake up
        )
    except requests.RequestException:
        return jsonify({"error": "Cannot reach the backend. Check that it is running "
                                 f"and that BACKEND_URL is correct ({BACKEND_URL})."}), 502
    return Response(upstream.content, status=upstream.status_code,
                    content_type=upstream.headers.get("Content-Type", "application/json"))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "8000")), debug=False)
