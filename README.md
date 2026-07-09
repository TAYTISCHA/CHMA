
## โครงสร้างไฟล์
```
/
├── index.html          ← หน้าเว็บน้องรหัส (login + dashboard ภารกิจ)
├── admin/
│   └── index.html      ← หน้าเว็บแอดมิน/รุ่นพี่ (ตรวจงาน)
├── config.js            ← ตั้งค่า URL ของ Apps Script (ใช้ร่วมกันทั้ง 2 หน้า)
├── vercel.json
├── Code.gs              ← โค้ด backend สำหรับวางใน Google Apps Script
└── README.md
```

## ขั้นตอนที่ 1: เตรียม Google Sheet

สร้าง Google Sheet ใหม่ 1 ไฟล์ แล้วสร้าง 3 ชีต ตั้งชื่อและคอลัมน์ตามนี้ **เป๊ะๆ** (แถวแรกเป็นหัวคอลัมน์):

**ชีต `Users`**
| student_id | nickname | password | line_code | current_step | task_status |
|---|---|---|---|---|---|
| 65010001 | ต้นข้าว | 1234 | A1 | 1 | Active |

- `current_step` เริ่มที่ `1` เสมอสำหรับน้องใหม่
- `task_status` เริ่มที่ `Active`

**ชีต `Hints`** (ใส่ล่วงหน้าให้ครบทุกสาย A1–A6 × 3 ด่าน = 18 แถว)
| line_code | step | task_title | task_desc | hint_text |
|---|---|---|---|---|
| A1 | 1 | ภารกิจที่ 1: ... | รายละเอียดภารกิจ... | คำใบ้/รางวัลที่จะเห็นหลังผ่านด่านนี้ |

**ชีต `Submissions`** (ปล่อยว่างไว้ ระบบจะเขียนข้อมูลให้เอง)
| sub_id | student_id | line_code | step | image_url | student_msg | status | reject_reason | timestamp |
|---|---|---|---|---|---|---|---|---|

## ขั้นตอนที่ 2: ติดตั้ง Google Apps Script (Backend)

1. ใน Google Sheet ไปที่ **Extensions > Apps Script**
2. ลบโค้ดเดิมทั้งหมด แล้ววางไฟล์ `Code.gs` ที่ให้มา
3. ไปที่ **Project Settings (⚙️) > Script Properties** แล้วเพิ่ม:
   | Property | Value |
   |---|---|
   | `SHEET_ID` | ไอดี Google Sheet (copy จาก URL ส่วนระหว่าง `/d/` กับ `/edit`) |
   | `ADMIN_USER` | ชื่อผู้ใช้แอดมินกลาง เช่น `adminA` |
   | `ADMIN_PASS` | รหัสผ่านแอดมินกลาง |
   | `DRIVE_FOLDER_ID` | *(ไม่ต้องใส่ก็ได้ ระบบจะสร้างโฟลเดอร์ให้อัตโนมัติในครั้งแรกที่มีการอัปโหลด)* |
4. กด **Deploy > New deployment**
   - Type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. กด Deploy แล้วอนุญาตสิทธิ์ (Authorize) ตามที่ระบบขอ
6. คัดลอก URL ที่ได้ (ลงท้ายด้วย `/exec`)

> ⚠️ ทุกครั้งที่แก้โค้ด `Code.gs` ต้องกด **Deploy > Manage deployments > แก้ไข (ดินสอ) > Version: New > Deploy** ใหม่ ไม่งั้นโค้ดเก่าจะยังทำงานอยู่

## ขั้นตอนที่ 3: ตั้งค่า Frontend

เปิดไฟล์ `config.js` แล้วแก้บรรทัดนี้เป็น URL ที่ได้จากขั้นตอนที่ 2:
```js
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec";
```

## ขั้นตอนที่ 4: Deploy ขึ้น Vercel

1. Push โค้ดทั้งโฟลเดอร์นี้ขึ้น GitHub repo
2. เข้า [vercel.com](https://vercel.com) > **Add New Project** > เลือก repo
3. Framework Preset เลือก **Other** (เป็น static site ล้วน ไม่ต้อง build)
4. กด Deploy

หลัง deploy เสร็จจะได้ 2 หน้า:
- `https://your-project.vercel.app/` → หน้าน้องรหัส
- `https://your-project.vercel.app/admin` → หน้าแอดมิน/รุ่นพี่

## กลไกความปลอดภัยที่ทำไว้ให้

- **คำใบ้ไม่ถูก hardcode ในหน้าบ้าน** — ฝั่ง frontend ไม่มีข้อความคำใบ้อยู่ในโค้ดเลย ทุกครั้งที่โหลดหน้า ระบบจะยิง API ไปถาม backend และ backend จะเช็คจากคอลัมน์ `current_step` ใน Sheet ก่อนว่าน้องผ่านด่านนั้นจริงหรือยัง ถ้ายังไม่ผ่านจะได้ค่า `"🔒 ยังไม่ปลดล็อค"` กลับมาแทน ต่อให้เปิด Inspect ดู network ก็จะไม่เห็นคำใบ้ของด่านที่ยังไม่ผ่าน
- **กันข้ามด่าน** — ตอนส่งภารกิจ (`submitTask`) backend เช็คจาก `current_step` ในชีต Users เสมอ ไม่เชื่อค่าที่ frontend ส่งมา ถ้าน้องพยายามยิง API ส่งด่านที่ยังไม่ถึงหรือผ่านไปแล้ว ระบบจะปฏิเสธ
- **แยกสิทธิ์น้อง/แอดมิน** — ใช้ token คนละชุด (`student_...` / `admin_...`) เก็บใน Google Cache แยกกันชัดเจน หมดอายุอัตโนมัติใน 6 ชั่วโมง
- **CORS** — เรียก API ด้วย `Content-Type: text/plain` แทน `application/json` เพื่อเลี่ยงการยิง CORS preflight (OPTIONS) ซึ่ง Apps Script Web App ไม่รองรับการตอบกลับโดยตรง เป็นวิธีมาตรฐานที่ใช้กันทั่วไปเวลาเชื่อม Apps Script กับหน้าเว็บภายนอก

## ข้อควรทราบ / จุดที่ควรปรับก่อนใช้งานจริง

- รหัสผ่านในชีต `Users` เป็น plain text เพื่อความง่ายในการดูแลของรุ่นพี่ (ไม่เหมาะกับข้อมูลสำคัญ แต่โอเคสำหรับกิจกรรมรับน้องภายในคณะ) หากต้องการความปลอดภัยสูงขึ้นสามารถปรับให้ hash รหัสผ่านก่อนเก็บได้
- ไฟล์รูปที่อัปโหลดจะถูกตั้งค่าเป็น "ทุกคนที่มีลิงก์ดูได้" เพื่อให้ทั้งหน้าน้องและหน้าแอดมินโหลดรูปได้ผ่าน URL ตรง
- ถ้าน้องในสายเดียวกันมีจำนวนมาก แนะนำเปิด Apps Script แบบ Execute as "Me" (เจ้าของ Sheet) เพื่อให้ Script มีสิทธิ์เขียนข้อมูลได้แม้น้องไม่ได้ login ด้วย Google Account
