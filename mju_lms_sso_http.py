import argparse
import base64
import json
import re
import secrets
import string
import time
from pathlib import Path
from typing import Any

import requests
from Crypto.Cipher import AES, PKCS1_v1_5
from Crypto.PublicKey import RSA
from Crypto.Protocol.KDF import PBKDF2
from Crypto.Util.Padding import pad

LMS_BASE = "https://lms.mju.ac.kr"
SSO_ENTRY = (
    "https://sso.mju.ac.kr/sso/auth?response_type=code&client_id=lms"
    "&state=Random%20String&redirect_uri=https://lms.mju.ac.kr/ilos/sso/sso_response.jsp"
)
MAIN_URL = f"{LMS_BASE}/ilos/main/main_form.acl"
WORKSPACE_ROOT = Path(__file__).resolve().parent
DEFAULT_STATE = WORKSPACE_ROOT / "scratch" / "mju_lms_sso_session.json"
DEFAULT_HTML = WORKSPACE_ROOT / "scratch" / "mju_lms_main.html"
DEFAULT_COURSES = WORKSPACE_ROOT / "scratch" / "mju_lms_courses.json"


def gen_key() -> tuple[str, bytes, bytes]:
    chars = string.ascii_letters + string.digits
    key_str = ''.join(secrets.choice(chars) for _ in range(64))
    salt = key_str[-16:].encode()
    key = PBKDF2(key_str.encode(), salt, dkLen=32, count=1024)
    iv = key[-16:]
    return key_str, key, iv


def encrypt_base64_aes(value: str, key: bytes, iv: bytes) -> str:
    enc64 = base64.b64encode(value.encode('utf-8'))
    cipher = AES.new(key, AES.MODE_CBC, iv)
    out = cipher.encrypt(pad(enc64, AES.block_size))
    return base64.b64encode(out).decode()


def encrypt_java_pki(value: str, public_key_b64: str) -> str:
    pem = '-----BEGIN PUBLIC KEY-----\n' + public_key_b64.replace(' ', '+') + '\n-----END PUBLIC KEY-----'
    pub = RSA.import_key(pem)
    cipher = PKCS1_v1_5.new(pub)
    out = cipher.encrypt(value.encode('utf-8'))
    return base64.b64encode(out).decode()


def get_sso_form(session: requests.Session) -> dict[str, str]:
    r = session.get(SSO_ENTRY, timeout=20)
    r.raise_for_status()
    html = r.text
    action = re.search(r'<form id="signin-form" action="([^"]+)"', html).group(1).replace('&amp;', '&')
    crt = re.search(r'name="c_r_t" value="([^"]+)"', html).group(1)
    pub = re.search(r'<input[^>]*value="([^"]+)"[^>]*id="public-key"', html).group(1)
    return {"action": action, "c_r_t": crt, "public_key": pub}


def login_sso(user_id: str, password: str) -> tuple[requests.Session, requests.Response]:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
    })
    form = get_sso_form(s)
    key_str, key, iv = gen_key()
    encsymka = encrypt_java_pki(key_str + ',' + str(int(time.time() * 1000)), form["public_key"])
    pw_enc = encrypt_base64_aes(password.strip(), key, iv)
    payload = {
        "user_id": user_id,
        "pw": "",
        "user_id_enc": "",
        "pw_enc": pw_enc,
        "encsymka": encsymka,
        "c_r_t": form["c_r_t"],
    }
    resp = s.post("https://sso.mju.ac.kr" + form["action"], data=payload, allow_redirects=True, timeout=30)
    return s, resp


def fetch_main(session: requests.Session) -> requests.Response:
    r = session.get(MAIN_URL, allow_redirects=True, timeout=20)
    return r


def looks_logged_in(resp: requests.Response) -> bool:
    text = resp.text
    url = resp.url.lower()
    if "login_form.acl" in url or "sso/auth" in url:
        return False
    bad_markers = ["다시 로그인", "통합로그인", "일반 로그인", "window.top.location.href=\"/ilos/main/member/login_form.acl\""]
    if any(marker in text for marker in bad_markers):
        return False
    return "/ilos/main/main_form.acl" in url or "top1menu" in text or "logout" in text.lower()


def extract_course_links(html: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    # generic extraction from links pointing to course/class pages
    seen = set()
    for m in re.finditer(r'<a[^>]+href="([^"]*(?:class|course|subj|lecture|subject)[^"]*)"[^>]*>(.*?)</a>', html, re.I | re.S):
        href = m.group(1)
        text = re.sub(r'<[^>]+>', ' ', m.group(2))
        text = re.sub(r'\s+', ' ', text).strip()
        key = (href, text)
        if text and key not in seen:
            seen.add(key)
            results.append({"title": text, "href": href})
    return results


def save_session(session: requests.Session, path: Path) -> None:
    data = {
        "cookies": requests.utils.dict_from_cookiejar(session.cookies),
        "headers": {"User-Agent": session.headers.get("User-Agent", "")},
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser(description="MJU LMS SSO login over HTTP session")
    ap.add_argument("--id", required=True, dest="user_id")
    ap.add_argument("--password", required=True)
    ap.add_argument("--save-session", default=str(DEFAULT_STATE))
    ap.add_argument("--save-main-html", default=str(DEFAULT_HTML))
    ap.add_argument("--save-courses", default=str(DEFAULT_COURSES))
    args = ap.parse_args()

    session, login_resp = login_sso(args.user_id, args.password)
    main_resp = fetch_main(session)
    ok = looks_logged_in(main_resp)

    save_session(session, Path(args.save_session))
    Path(args.save_main_html).parent.mkdir(parents=True, exist_ok=True)
    Path(args.save_main_html).write_text(main_resp.text, encoding="utf-8")

    courses = extract_course_links(main_resp.text)
    Path(args.save_courses).parent.mkdir(parents=True, exist_ok=True)
    Path(args.save_courses).write_text(json.dumps(courses, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "logged_in": ok,
        "login_final_url": login_resp.url,
        "main_final_url": main_resp.url,
        "cookie_count": len(session.cookies),
        "course_candidates": len(courses),
        "session_path": args.save_session,
        "main_html_path": args.save_main_html,
        "courses_path": args.save_courses,
    }, ensure_ascii=False))

    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
