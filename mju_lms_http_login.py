import argparse
import json
import re
from pathlib import Path

import requests

BASE = "https://lms.mju.ac.kr"
LOGIN_FORM_URL = f"{BASE}/ilos/main/member/login_form.acl"
LOGIN_POST_URL = f"{BASE}/ilos/lo/login.acl"
MAIN_URL = f"{BASE}/ilos/main/main_form.acl"
WORKSPACE_ROOT = Path(__file__).resolve().parent
DEFAULT_STATE = WORKSPACE_ROOT / "scratch" / "mju_lms_session.json"


def is_logged_in_response(resp: requests.Response) -> bool:
    url = resp.url.lower()
    text = resp.text.lower()

    # obvious unauth / login indicators seen on MJU LMS
    unauth_markers = [
        "login_form.acl",
        "sso_check",
        "usr_id",
        "usr_pwd",
        "통합로그인",
        "일반 로그인",
        "/ilos/lo/login.acl",
        "다시 로그인",
        "window.top.location.href=\"/ilos/main/member/login_form.acl\"",
        "login_loading_area",
    ]

    if any(marker.lower() in url or marker.lower() in text for marker in unauth_markers):
        return False

    # weak positive signals that usually appear after actual login
    auth_markers = [
        "/ilos/main/main_form.acl",
        "/ilos/main/main_form",
        "logout",
        "top1menu",
        "mypage",
    ]
    return any(marker.lower() in url or marker.lower() in text for marker in auth_markers)


def extract_hidden_fields(html: str) -> dict:
    fields = {}
    for name in ["returnURL", "challenge", "response", "auto_login"]:
        m = re.search(rf'name=["\']{re.escape(name)}["\']\s+value=["\']([^"\']*)["\']', html, re.I)
        fields[name] = m.group(1) if m else ""
    return fields


def login(user_id: str, password: str, keep_login: bool = False) -> tuple[bool, dict]:
    s = requests.Session()
    s.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0 Safari/537.36"
    })

    r = s.get(LOGIN_FORM_URL, timeout=20)
    r.raise_for_status()
    hidden = extract_hidden_fields(r.text)

    payload = {
        "usr_id": user_id,
        "usr_pwd": password,
        "returnURL": hidden.get("returnURL", ""),
        "challenge": hidden.get("challenge", ""),
        "response": hidden.get("response", ""),
        "auto_login": "Y" if keep_login else "N",
    }

    post = s.post(LOGIN_POST_URL, data=payload, timeout=20, allow_redirects=True)
    ok = is_logged_in_response(post)
    if not ok:
        # try main page once more in case login endpoint responds weirdly but cookies were set
        probe = s.get(MAIN_URL, timeout=20, allow_redirects=True)
        ok = is_logged_in_response(probe)
        final = probe
    else:
        final = post

    state = {
        "logged_in": ok,
        "final_url": final.url,
        "cookies": requests.utils.dict_from_cookiejar(s.cookies),
        "headers": {"User-Agent": s.headers.get("User-Agent", "")},
    }
    return ok, state


def main():
    ap = argparse.ArgumentParser(description="Myongji LMS HTTP-session login prototype")
    ap.add_argument("--id", required=True, dest="user_id")
    ap.add_argument("--password", required=True)
    ap.add_argument("--keep-login", action="store_true")
    ap.add_argument("--save", default=str(DEFAULT_STATE))
    args = ap.parse_args()

    ok, state = login(args.user_id, args.password, keep_login=args.keep_login)
    save_path = Path(args.save)
    save_path.parent.mkdir(parents=True, exist_ok=True)
    save_path.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")

    print(json.dumps({
        "logged_in": ok,
        "final_url": state["final_url"],
        "cookie_count": len(state["cookies"]),
        "save_path": str(save_path)
    }, ensure_ascii=False))

    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
