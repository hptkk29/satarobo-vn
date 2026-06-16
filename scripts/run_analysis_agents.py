import os
import sys
import json
import urllib.request
import urllib.error

# Add parent directory to path to allow importing local packages if needed
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def read_file(path):
    if not os.path.exists(path):
        return ""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

def write_file(path, content):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

def call_gemini(api_key, system_instruction, prompt):
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
    
    payload = {
        "systemInstruction": {
            "parts": [{"text": system_instruction}]
        },
        "contents": [
            {
                "parts": [{"text": prompt}]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 8192
        }
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            return res_data["candidates"][0]["content"]["parts"][0]["text"]
    except urllib.error.HTTPError as e:
        print(f"HTTP Error: {e.code} - {e.reason}")
        print(e.read().decode("utf-8"))
        sys.exit(1)
    except Exception as e:
        print(f"Error calling Gemini API: {e}")
        sys.exit(1)

def load_api_key():
    # Try loading from environment variable
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        return api_key
        
    # Try loading from .env or .env.local
    for env_file in [".env.local", ".env"]:
        path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), env_file)
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GEMINI_API_KEY="):
                        return line.strip().split("=", 1)[1].strip().strip('"').strip("'")
    return None

def main():
    api_key = load_api_key()
    if not api_key:
        print("Error: GEMINI_API_KEY not found in environment variables, .env, or .env.local")
        print("Please configure GEMINI_API_KEY to run the multi-agent analysis.")
        sys.exit(1)
        
    extracted_reqs_path = "d:/Code/RoboDev/satarobo-vn/Document/request/extracted_requirements.txt"
    if not os.path.exists(extracted_reqs_path):
        print(f"Error: Extracted requirements file not found at {extracted_reqs_path}")
        print("Please make sure you have extracted the requirements text first.")
        sys.exit(1)
        
    raw_requirements = read_file(extracted_reqs_path)
    
    # ----------------------------------------------------
    # AGENT 1: Business Analyst (BA)
    # ----------------------------------------------------
    print("Running BA Agent...")
    ba_system = (
        "Bạn là một Business Analyst (BA) cao cấp chuyên về hệ thống quản lý học thuật và CRM cho giáo dục STEM/Robotics.\n"
        "Nhiệm vụ của bạn là đọc các yêu cầu thô của khách hàng và chuyển đổi chúng thành tài liệu yêu cầu nghiệp vụ chuyên sâu (Business Requirements Document - BRD)\n"
        "và danh sách User Stories chi tiết kèm tiêu chí nghiệm thu (Acceptance Criteria - UAT) rõ ràng.\n"
        "Đảm bảo tài liệu được phân tích sâu sắc, khoa học, dễ hiểu cho lập trình viên, viết bằng tiếng Việt, dùng thuật ngữ tiếng Anh chuẩn kỹ thuật."
    )
    ba_prompt = (
        f"Dưới đây là tài liệu yêu cầu thô của khách hàng:\n\n{raw_requirements}\n\n"
        "Hãy viết tài liệu yêu cầu nghiệp vụ chi tiết. Cấu trúc tài liệu:\n"
        "1. Tổng quan yêu cầu & Nghiệp vụ cần giải quyết\n"
        "2. Phân tích chức năng chi tiết (chia theo các module chính: Quản lý học viên/Lớp học/CRM/LMS/Tài chính)\n"
        "3. Danh sách User Stories chi tiết (định dạng: As a... I want to... So that...)\n"
        "4. Tiêu chí nghiệm thu (UAT Acceptance Criteria) cho từng câu chuyện người dùng."
    )
    ba_output = call_gemini(api_key, ba_system, ba_prompt)
    ba_file = "d:/Code/RoboDev/satarobo-vn/Document/analysis/01_ba_requirements.md"
    write_file(ba_file, ba_output)
    print(f"BA Agent finished. Saved requirements to: {ba_file}")
    
    # ----------------------------------------------------
    # AGENT 2: Project Manager (PM)
    # ----------------------------------------------------
    print("Running PM Agent...")
    pm_system = (
        "Bạn là một Project Manager (PM) / Product Owner dày dặn kinh nghiệm quản lý dự án Agile/Scrum.\n"
        "Nhiệm vụ của bạn là nhận tài liệu phân tích của BA, phân tách chúng thành các task/tickets chi tiết,\n"
        "định nghĩa mức độ ưu tiên theo chuẩn MoSCoW (Must, Should, Could, Won't), ước lượng độ phức tạp (Story Points / Hours),\n"
        "xác định sự phụ thuộc giữa các task (Dependencies) và lập lộ trình phát triển (Sprint Roadmap) cụ thể.\n"
        "Viết tài liệu bằng tiếng Việt, cấu trúc khoa học và rõ ràng."
    )
    pm_prompt = (
        f"Dưới đây là tài liệu yêu cầu nghiệp vụ đã được BA phân tích:\n\n{ba_output}\n\n"
        "Hãy chuyển đổi tài liệu trên thành danh sách task quản lý dự án chi tiết. Cấu trúc tài liệu:\n"
        "1. Kế hoạch tổng thể & Lộ trình phát triển (Roadmap chia theo Sprint/Phase)\n"
        "2. Danh sách backlog task/tickets chi tiết (Mỗi task gồm: Tên task, Mô tả ngắn, Mức độ ưu tiên, Ước lượng, Sự phụ thuộc - Dependencies)\n"
        "3. Quản trị rủi ro & Lưu ý trong quá trình phân bổ nguồn lực."
    )
    pm_output = call_gemini(api_key, pm_system, pm_prompt)
    pm_file = "d:/Code/RoboDev/satarobo-vn/Document/analysis/02_pm_tasks.md"
    write_file(pm_file, pm_output)
    print(f"PM Agent finished. Saved tasks to: {pm_file}")
    
    # ----------------------------------------------------
    # AGENT 3: Tech Lead (Leader)
    # ----------------------------------------------------
    print("Running Tech Lead Agent...")
    tl_system = (
        "Bạn là một Software Architect / Tech Lead cao cấp chuyên về hệ sinh thái Next.js 16, Prisma 5, Supabase, Cloudflare R2.\n"
        "Nhiệm vụ của bạn là nhận tài liệu yêu cầu của BA và danh sách task của PM, thiết kế giải pháp kỹ thuật tối ưu nhất.\n"
        "Xác định chính xác các thay đổi trong Database Schema (Prisma), các Route API/Server Actions cần tạo, các UI Components cần viết,\n"
        "và cung cấp các template code hoặc mẫu code skeleton kèm theo hướng dẫn viết code chuẩn để Dev chỉ cần copy/áp dụng là chạy được."
    )
    tl_prompt = (
        f"Dưới đây là tài liệu yêu cầu của BA:\n\n{ba_output}\n\n"
        f"Dưới đây là danh sách task của PM:\n\n{pm_output}\n\n"
        "Hãy viết tài liệu thiết kế kỹ thuật chi tiết phục vụ cho nhà phát triển (Dev). Cấu trúc tài liệu:\n"
        "1. Thiết kế cơ sở dữ liệu (Database Schema updates trong Prisma)\n"
        "2. Thiết kế API & Server Actions (Định nghĩa endpoints, payloads, logic xử lý cụ thể)\n"
        "3. Cấu trúc Components & Route Groups Next.js cần sửa/thêm mới\n"
        "4. Code Skeletons & Code Templates mẫu cụ thể cho các tính năng phức tạp\n"
        "5. Hướng dẫn kiểm thử và nghiệm thu kỹ thuật (Technical verification)."
    )
    tl_output = call_gemini(api_key, tl_system, tl_prompt)
    tl_file = "d:/Code/RoboDev/satarobo-vn/Document/analysis/03_tech_lead_spec.md"
    write_file(tl_file, tl_output)
    print(f"Tech Lead Agent finished. Saved technical spec to: {tl_file}")
    
    print("\n=======================================================")
    print("Multi-Agent requirement analysis pipeline completed!")
    print("Outputs generated:")
    print(f"1. {ba_file}")
    print(f"2. {pm_file}")
    print(f"3. {tl_file}")
    print("=======================================================")

if __name__ == "__main__":
    main()
