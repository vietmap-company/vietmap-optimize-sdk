# Optimize SDK (Fleetwork)

SDK cho **Fleetwork Optimize API** — định tuyến xe (VROOM-style VRP / auto-assign) trên `/api/v1/optimize`. Gói gọn trong **một package** `@vietmap/optimize-sdk`, dùng theo **2 hướng**:

- **A. Headless controller** — bạn chỉ lấy *logic* (chọn ngày, gán việc cho xe, tối ưu, xác nhận) rồi **tự dựng UI**. Không kéo theo Lit/React.
- **B. Giao diện có sẵn** — thả web component `<vietmap-optimize-planner>` (kèm bản đồ VietMap) vào bất kỳ framework nào, hoặc component React `<OptimizePlanner>`.

> Web component ở hướng B thực chất là một *view mỏng* bọc quanh controller ở hướng A — nên logic hai bên không bao giờ lệch nhau.

API docs: https://fleetwork.vn/docs/sdk/optimize-api

## Cài đặt

```bash
npm i @vietmap/optimize-sdk
```

Cài **1 gói**, import theo nhu cầu:

| Import | Dùng cho |
| --- | --- |
| `@vietmap/optimize-sdk` | Core + **`OptimizePlannerController`** (headless) + client `VietmapOptimize`. Zero-dep. |
| `@vietmap/optimize-sdk/elements` | Web component `<vietmap-optimize-planner>` / `<vietmap-route-map>` (Lit). |
| `@vietmap/optimize-sdk/react` | React: `<OptimizePlanner>` + `useOptimize()`. |

`lit` đi kèm cho phần web component; `react` là **optional peer** (chỉ cần khi dùng `/react`). Không bundler thì dùng bản IIFE qua CDN:

```html
<script src="https://cdn.jsdelivr.net/npm/@vietmap/optimize-sdk/dist/index.global.js"></script>          <!-- global: VietmapOptimizeSDK -->
<script src="https://cdn.jsdelivr.net/npm/@vietmap/optimize-sdk/dist/elements/index.global.js"></script>  <!-- global: VietmapOptimizeElements -->
```

## Mô hình dữ liệu

- **Xe (`PlannerVehicle`)** — `id`, `plate` (biển số), `vehicleType`, `capacity`, `start` `[lon,lat]`, `workingHours` `[phút,phút]`, `skills`, `cities`.
- **Công việc** — truyền **một mảng `jobs`** (`PlannerJobInput`); SDK tự phân loại theo shape của từng item:
  - có `location` (1 điểm) → **dịch vụ** (`PlannerService`) → VROOM `job`.
  - có cả `pickup` **và** `delivery` (mỗi bên là `{ location, serviceMinutes? }`) → **giao hàng** (`PlannerShipment`) → VROOM `shipment`.

Toạ độ luôn `[lon, lat]`; thời gian tính bằng phút-trong-ngày. Không cần gắn `kind` — cách suy luận này khớp với chính cách VROOM phân biệt job/shipment.

---

## A) Headless controller — tự dựng UI

`OptimizePlannerController` là **toàn bộ quy trình auto-assign, không kèm UI**: chọn ngày → nạp việc của ngày → gán tay / tối ưu → xác nhận. Bạn `subscribe` để render theo cách của mình; controller lo phần trạng thái + gọi API.

```ts
import { OptimizePlannerController, classifyJobs } from '@vietmap/optimize-sdk'

const planner = new OptimizePlannerController({ apiKey: 'X_API_KEY' })

// 1) Ngày đổi → tự fetch việc của ngày đó rồi nạp vào controller
planner.on('daychange', async ({ day }) => {
  const jobs = await fetch(`/api/jobs?day=${day}`).then((r) => r.json())
  planner.setTasks(classifyJobs(jobs)) // 1 mảng jobs → tasks (tự phân loại service/shipment)
})

// 2) Render mỗi khi state đổi (trả về hàm huỷ đăng ký)
const stop = planner.subscribe((state) => {
  renderBoard(state) // state.assignment / unassigned / stats / arrivals / …
})

// 3) Nạp xe + chọn ngày (setDay sẽ kích hoạt 'daychange' ở trên)
planner.setVehicles(vehicles)
planner.setDay('2026-09-08')

// 4) Gán tay (tuỳ chọn) rồi tối ưu — hoặc bỏ qua bước gán, để solver tự xếp
planner.assign('DV-103', 'xe1')
await planner.optimize()

// 5) Chốt kế hoạch
const plan = planner.confirm() // { day, assignment, unassigned, arrivals }

// khi unmount: stop(); planner.destroy()
```

### API tóm tắt

**Khởi tạo:** `new OptimizePlannerController({ apiKey, baseUrl?, day?, vehicles?, tasks?, client? })`

**Nhập liệu**
| Method | Ý nghĩa |
| --- | --- |
| `setDay(day)` | Chọn ngày; phát `daychange` để bạn fetch việc của ngày đó. |
| `setTasks(tasks)` | Thay việc của ngày. Từ 1 mảng jobs: `setTasks(classifyJobs(jobs))`. |
| `setVehicles(vehicles)` | Thay danh sách xe (giữ lại các gán còn hợp lệ). |
| `setApiKey(key)` · `setBaseUrl(url)` | Đổi cấu hình client nội bộ. |

**Gán thủ công**
| Method | Ý nghĩa |
| --- | --- |
| `assign(taskKey, vehicleKey)` | Gán 1 việc cho 1 xe. |
| `move(taskKey, vehicleKey \| null)` | Chuyển việc sang xe khác, hoặc `null` = về pool chưa gán. |
| `unassign(taskKey)` · `clearAssignments()` | Trả 1 việc / tất cả về pool. |

**Tối ưu & chốt**
| Method | Ý nghĩa |
| --- | --- |
| `optimize(opts?)` | Gọi `/api/v1/optimize`, gấp kết quả vào state. `opts.kinds` để chỉ giải 1 loại (vd `['shipment']`). Throw + set `state.error` nếu lỗi. |
| `retime(taskKey, role, sec)` | Chỉnh giờ tới của 1 điểm (`role`: `service`/`pickup`/`delivery`; shipment tự kẹp pickup ≤ delivery). |
| `confirm()` | Trả `{ day, assignment, unassigned, arrivals }` + phát `confirm`. |

**Đọc trạng thái:** `planner.state` (read-only) · `stopsForVehicle(vehicleKey)` (điểm dừng đã sắp theo giờ) · `taskByKey` / `vehicleByKey`.

```ts
state = {
  day, tasks, vehicles,
  assignment,  // { vehicleKey: [taskKey, …] } — thứ tự dừng
  unassigned,  // [taskKey, …]
  arrivals,    // { stopKey: giây }  (stopKey = taskKey | taskKey:pickup | taskKey:delivery)
  stats,       // { vehicleKey: { distance, duration } }
  reasons,     // { taskKey: lý do không xếp được }
  loading, error, response,
}
```

**Sự kiện:** `on(type, handler)` → trả hàm huỷ. Loại: `daychange` · `optimize` · `assignmentchange` · `retime` · `confirm` · `change` (mọi thay đổi state). `subscribe(fn)` = nghe mọi thay đổi (giống `change`).

> Cần gọi API “trần”? Vẫn export `VietmapOptimize` (client `fetch`) + `buildRequest(tasks, vehicles)` để tự map sang contract VROOM và tự xử lý response.

---

## B) Giao diện có sẵn

Web component `<vietmap-optimize-planner>` = bảng kéo-thả xe/việc + **bản đồ VietMap** vẽ tuyến của các việc đã gán (đường thật, xuất phát từ kho). Quy tắc bind: **object/array → set qua DOM property**, chuỗi → attribute, nghe **sự kiện** `vm-*`. Nhập **VietMap map key** (`tile-key`) để có nền bản đồ.

Cùng luồng như hướng A: component phát `vm-daychange` → bạn fetch việc của ngày → set lại `.jobs`.

### B1. Vanilla / mọi framework

```html
<vietmap-optimize-planner id="p"></vietmap-optimize-planner>
<script src="…/@vietmap/optimize-sdk/dist/elements/index.global.js"></script>
<script>
  const p = document.getElementById('p')
  p.apiKey = 'X_API_KEY'          // optimize (X-API-Key)
  p.tileKey = 'VIETMAP_MAP_KEY'   // nền bản đồ VietMap
  p.vehicles = [{ id: 'xe1', plate: '51C-123.45', start: [106.66, 10.76], workingHours: [480, 1080] }]
  p.day = '2026-09-08'
  p.addEventListener('vm-daychange', async (e) => {
    // object/array phải set qua PROPERTY (không phải attribute)
    p.jobs = await fetch(`/api/jobs?day=${e.detail.day}`).then((r) => r.json())
  })
  p.addEventListener('vm-confirm', (e) => console.log(e.detail))
</script>
```

Có bundler thì `import '@vietmap/optimize-sdk/elements'` để đăng ký element (khỏi cần thẻ `<script>`). Sự kiện: `vm-daychange` · `vm-optimize` · `vm-assignmentchange` · `vm-retime` · `vm-confirm`.

### B2. React

Component **`<OptimizePlanner>`** — truyền props, không cần ref:

```tsx
import { useState } from 'react'
import { OptimizePlanner } from '@vietmap/optimize-sdk/react'

function Dispatch() {
  const [day, setDay] = useState('2026-09-08')
  const jobs = useJobsForDay(day) // fetch của bạn → 1 mảng, không cần `kind`
  return (
    <OptimizePlanner
      apiKey="X_API_KEY" tileKey="VIETMAP_MAP_KEY"
      vehicles={vehicles} jobs={jobs}
      day={day} onDayChange={setDay}
      onConfirm={(plan) => console.log(plan)}
      style={{ height: '100%' }}
    />
  )
}
```

Đổi ngày → `onDayChange(day)` → fetch việc của ngày rồi cập nhật `jobs` (state). Muốn tự dựng UI thì dùng **hook**: `import { FleetworkProvider, useOptimize } from '@vietmap/optimize-sdk/react'`. (Entry `/react` cũng kèm sẵn JSX types cho raw tag `<vietmap-optimize-planner>` nếu bạn thích dùng thẳng tag.)

### B3. Vue

Khai báo custom element trong `vite.config.ts`, rồi bind bằng modifier **`.prop`**:

```ts
vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('vietmap-') } } })
```

```vue
<script setup>
import '@vietmap/optimize-sdk/elements'
</script>
<template>
  <vietmap-optimize-planner
    :api-key="apiKey" :tile-key="mapKey" :day="day"
    :vehicles.prop="vehicles" :jobs.prop="jobs"
    @vm-daychange="onDayChange" />
</template>
```

### B4. Framework khác

Cùng một web component, chỉ khác cú pháp bind — quy tắc chung: **object/array → DOM property, chuỗi → attribute, sự kiện → listener**.

| | `jobs` / `vehicles` (array) | `day` / key (chuỗi) | sự kiện |
| --- | --- | --- | --- |
| **Vanilla** | `el.jobs = jobs` | `el.day = '…'` | `el.addEventListener('vm-daychange', …)` |
| **Vue** | `:jobs.prop="jobs"` | `:day="day"` | `@vm-daychange="…"` |
| **Angular** \* | `[jobs]="jobs"` | `[day]="day"` | `(vm-daychange)="…($event)"` |
| **Svelte** | `jobs={jobs}` | `day={day}` | `on:vm-daychange={…}` |

\* Angular cần `CUSTOM_ELEMENTS_SCHEMA` trong module/component.

## License

MIT © VietMap
