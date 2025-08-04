import os
import sys
import json
import argparse
import requests
from pathlib import Path
from urllib.parse import quote_plus

def download_videos(workflows: list, video_dir: Path, limit: int = None):
    """
    Download tất cả video trong workflows về thư mục video_dir.
    File sẽ được đặt tên <mediaKey>.mp4.
    """
    downloaded = 0
    video_dir.mkdir(parents=True, exist_ok=True)

    for wf in workflows:
        wf_id = wf.get("workflowId", "unknown-workflow")
        for step in wf.get("workflowSteps", []):
            step_id = step.get("workflowStepId", "unknown-step")
            for gen in step.get("mediaGenerations", []):
                if limit is not None and downloaded >= limit:
                    return

                # extract thông tin id để đặt tên file
                media_info = gen["mediaGenerationId"]
                media_key = media_info.get("mediaKey")
                if not media_key:
                    print(f"Warning: skip generation without mediaKey in {wf_id}/{step_id}", file=sys.stderr)
                    continue

                # url video
                try:
                    fife_url = gen["mediaData"]["videoData"]["fifeUri"]
                except KeyError:
                    print(f"Warning: no fifeUri for {media_key}", file=sys.stderr)
                    continue

                out_path = video_dir / f"{media_key}.mp4"
                print(f"Downloading {media_key} → {out_path}")

                # streaming download
                resp = requests.get(fife_url, stream=True)
                try:
                    resp.raise_for_status()
                except requests.HTTPError as e:
                    print(f"Error downloading {media_key}: {e}", file=sys.stderr)
                    continue

                with open(out_path, "wb") as f:
                    for chunk in resp.iter_content(chunk_size=8_192):
                        if chunk:
                            f.write(chunk)

                print(f"  ✓ Saved {out_path}\n")
                downloaded += 1

def fetch_all_workflows(project_id: str, session: requests.Session, page_size: int = 3):
    cursor = None
    all_workflows = []
    endpoint = "https://labs.google/fx/api/trpc/project.searchProjectWorkflows"

    while True:
        encoded_cursor = quote_plus(cursor) if cursor is not None else None

        json_part = {
            "pageSize": page_size,
            "projectId": project_id,
            "toolName": "PINHOLE",
            "cursor": encoded_cursor
        }

        # Chỉ thêm meta khi lần đầu (cursor is None)
        if cursor is None:
            input_obj = {
                "json": json_part,
                "meta": {
                    "values": {
                        "cursor": ["undefined"]
                    }
                }
            }
        else:
            input_obj = {"json": json_part}

        param_str = json.dumps(input_obj, separators=(',',':'))
        resp = session.get(endpoint, params={"input": param_str})
        resp.raise_for_status()

        data = resp.json()
        result = data["result"]["data"]["json"]["result"]
        workflows = result.get("workflows", [])
        next_page_token = result.get("nextPageToken")

        all_workflows.extend(workflows)

        if not next_page_token:
            break
        cursor = next_page_token

    return all_workflows


def main():
    default_downloads = Path.home() / "Downloads"
    default_downloads.mkdir(parents=True, exist_ok=True)

    parser = argparse.ArgumentParser(description="Download dự án theo project_id")
    parser.add_argument("project_id", help="UUID của project cần download")
    parser.add_argument("-c", "--cookie-file", dest="cookie_file", required=True, help="Đường dẫn tệp cookie JSON (bắt buộc)")
    parser.add_argument("-d", "--video-dir", dest="video_dir", default=str(default_downloads), help=f"Thư mục lưu video (mặc định: {default_downloads})")
    parser.add_argument("-l", "--limit", type=int, default=None, help="Giới hạn số video đầu tiên được tải")
    parser.add_argument("-o", "--order", choices=["asc","desc"], default="asc", help="Thứ tự sắp xếp workflows theo createTime: asc (cũ→mới) hoặc desc (mới→cũ)")

    args = parser.parse_args()
    project_id = args.project_id
    video_dir = args.video_dir

    cookie_file = Path(args.cookie_file)
    if not cookie_file.is_file():
        print(f"Error: Tệp cookie '{cookie_file}' không tồn tại.", file=sys.stderr)
        sys.exit(1)

    if args.video_dir:
        video_dir = Path(args.video_dir)

        if not os.path.isdir(video_dir):
            print(f"Error: Thư mục '{video_dir}' không tồn tại.", file=sys.stderr)
            sys.exit(1)
    else:
        video_dir = default_downloads

    try:
        cookie_data = json.loads(cookie_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print("Error: Chỉ hỗ trợ JSON cookie.", file=sys.stderr)
        sys.exit(1)

    if isinstance(cookie_data, dict) and "cookies" in cookie_data and isinstance(cookie_data["cookies"], list):
        cookie_list = cookie_data["cookies"]
    elif isinstance(cookie_data, list):
        cookie_list = cookie_data
    elif isinstance(cookie_data, dict):
        cookie_list = [{"name": k, "value": v} for k, v in cookie_data.items()]
    else:
        print("Error: Định dạng JSON cookie không đúng.", file=sys.stderr)
        sys.exit(1)

    if not isinstance(cookie_data, (list, dict)):
        print("Error: Định dạng JSON cookie không đúng (cần array hoặc object).", file=sys.stderr)
        sys.exit(1)

    print(f"Project ID: {project_id}")
    print(f"Lưu video tại: {video_dir}")

    referer_url = f"https://labs.google/fx/vi/tools/flow/project/{project_id}?"

    session = requests.Session()
    session.headers.update({"Referer": referer_url})
    session.headers.update({"content-type": "application/json"})
    session.headers.update({"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36"})

    if isinstance(cookie_list, list):
        for c in cookie_list:
            session.cookies.set(c["name"], c["value"])
    else:
        for k, v in cookie_list.items():
            session.cookies.set(k, v)
    
    workflows = fetch_all_workflows(project_id, session, page_size=3)

    reverse = True if args.order == "desc" else False
    workflows.sort(key=lambda wf: wf.get("createTime",""), reverse=reverse)
    print(f"Đã sort {len(workflows)} workflows theo createTime ({args.order}).\n")

    project_dir = video_dir / project_id
    project_dir.mkdir(parents=True, exist_ok=True)
    download_videos(workflows, project_dir, limit=args.limit)
    


if __name__ == "__main__":
    main()