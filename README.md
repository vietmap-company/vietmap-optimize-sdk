# Optimize SDK (Fleetwork)

SDK cho **Fleetwork Optimize API** — định tuyến xe (VROOM-style VRP / auto-assign) trên public `/api/v1/optimize`. **Một package duy nhất** `@vietmap/optimize-sdk` với 3 entry: **core** framework-agnostic, bộ **web components**, và lớp **React** — cài 1 gói, import đúng phần bạn cần.

| Entry (import) | Dùng cho |
| --- | --- |
| `@vietmap/optimize-sdk` | Core headless — class `VietmapOptimize`, mô hình domain + `buildRequest`, và **`OptimizePlannerController` headless**. `fetch`, zero-dep, có IIFE cho `<script>`/CDN. |
| `@vietmap/optimize-sdk/elements` | Web component `<vietmap-optimize-planner>` / `<vietmap-route-map>` (Lit) — dùng ở mọi framework + vanilla. |
| `@vietmap/optimize-sdk/react` | React — `<OptimizePlanner>` (props) + `<FleetworkProvider>` / `useOptimize()`. |

Ví dụ: `examples/react-demo` (cổng 5180) · `examples/vue-demo` (cổng 5181).

API docs: https://fleetwork.vn/docs/sdk/optimize-api

## Cài đặt

```bash
npm i @vietmap/optimize-sdk
```

Một gói, import theo nhu cầu: `@vietmap/optimize-sdk` (core) · `@vietmap/optimize-sdk/elements` (web component) · `@vietmap/optimize-sdk/react` (React). Core zero-dep; `lit` đi kèm cho phần web component; `react` là **optional peer** (chỉ cần khi dùng entry `/react`).

Hoặc dùng qua CDN không cần bundler (bản IIFE):

```html
<!-- core (headless) — global VietmapOptimizeSDK -->
<script src="https://cdn.jsdelivr.net/npm/@vietmap/optimize-sdk/dist/index.global.js"></script>
<!-- web components — global VietmapOptimizeElements -->
<script src="https://cdn.jsdelivr.net/npm/@vietmap/optimize-sdk/dist/elements/index.global.js"></script>
```

## Mô hình dữ liệu

- **Xe (`PlannerVehicle`)** — `id`, `plate` (biển số), `vehicleType`, `capacity`, `start` `[lon,lat]`, `workingHours` `[phút,phút]`, `skills`, `cities`.
- **Công việc (`PlannerJobInput`)** — bạn truyền **một mảng `jobs`** duy nhất; SDK tự phân loại theo shape của từng item:
  - có `location` (1 điểm) → **dịch vụ** (`PlannerService`) → VROOM `job`.
  - có cả `pickup` **và** `delivery` (mỗi bên là `{ location, serviceMinutes? }`) → **giao hàng** (`PlannerShipment`) → VROOM `shipment`.

Không cần tự tách hay gắn `kind` — cách suy luận này khớp với chính cách VROOM phân biệt job/shipment. Muốn kiểm soát thủ công vẫn có thể set riêng `services`/`shipments`.

## 1) Web component (mọi framework / vanilla)

Chọn **1 ngày** → component phát `vm-daychange` → bạn tự gọi API lấy job của ngày đó rồi set **một mảng `.jobs`**. Map vẽ **tuyến của các job đã gán cho xe** (từ kho xuất phát, theo đường thật của VietMap); nhập **VietMap API key** (`tile-key`) để có nền bản đồ.

Với bundler: `import '@vietmap/optimize-sdk/elements'` (đăng ký custom element). Không bundler thì dùng bản IIFE:

```html
<vietmap-optimize-planner id="p"></vietmap-optimize-planner>
<script src="…/@vietmap/optimize-sdk/dist/elements/index.global.js"></script>
<script>
  const p = document.getElementById('p')
  p.apiKey = 'X_API_KEY'          // optimize (X-API-Key)
  p.tileKey = 'VIETMAP_MAP_KEY'   // nền bản đồ VietMap
  p.vehicles = [
    { id: 'xe1', plate: '51C-123.45', vehicleType: 'Xe tải 1.5T', capacity: [1500],
      start: [106.66, 10.76], workingHours: [480, 1080] },
  ]
  p.day = '2026-09-08'
  // Ngày được bind ra ngoài — khách tự lấy job của ngày rồi set MỘT mảng `jobs`.
  p.addEventListener('vm-daychange', async (e) => {
    // object/array phải set qua PROPERTY (không phải attribute).
    p.jobs = await fetch(`/api/jobs?day=${e.detail.day}`).then((r) => r.json())
    // vd: { id, location, serviceMinutes }  hoặc  { id, pickup: { location }, delivery: { location } }
  })
  p.addEventListener('vm-confirm', (e) => console.log(e.detail))
</script>
```

Events: `vm-daychange` · `vm-optimize` · `vm-assignmentchange` · `vm-retime` · `vm-confirm`.

## 2) Headless controller (không cần UI)

Cho khách muốn **tự dựng UI** — chỉ cần import core `@vietmap/optimize-sdk`, không kéo theo Lit/React:

```ts
import { OptimizePlannerController } from '@vietmap/optimize-sdk'

const planner = new OptimizePlannerController({ apiKey: 'X_API_KEY' })
planner.on('daychange', ({ day }) => fetchJobs(day).then((tasks) => planner.setTasks(tasks)))
planner.setVehicles(vehicles)
planner.subscribe((state) => render(state)) // state.assignment / unassigned / stats / …

planner.setDay('2026-09-08')
planner.assign('DV-103', 'xe1')             // gán thủ công (tuỳ chọn)
await planner.optimize()                     // hoặc để solver tự xếp
const plan = planner.confirm()
```

## 3) React

Dùng component **`<OptimizePlanner>`** từ `@vietmap/optimize-sdk/react` — truyền `vehicles` + **một mảng `jobs`** qua props, không cần ref, không tự tách service/shipment:

```tsx
import { useState } from 'react'
import { OptimizePlanner } from '@vietmap/optimize-sdk/react'

function Dispatch() {
  const [day, setDay] = useState('2026-09-08')
  const jobs = useJobsForDay(day) // fetch của bạn → 1 list, không cần `kind`
  return (
    <OptimizePlanner
      apiKey="X_API_KEY"
      tileKey="VIETMAP_MAP_KEY"
      vehicles={vehicles}
      jobs={jobs}
      day={day}
      onDayChange={setDay}
      onConfirm={(plan) => console.log(plan)}
      style={{ height: '100%' }}
    />
  )
}
```

SDK tự suy ra **service** (1 `location`) hay **shipment** (`pickup` + `delivery`) từ shape của từng job — đúng theo cách VROOM phân biệt.

Đổi ngày → `onDayChange` trả về ngày mới → bạn fetch job của ngày đó rồi cập nhật `jobs` (state). Entry `@vietmap/optimize-sdk/react` cũng kèm sẵn **JSX types** cho raw tag `<vietmap-optimize-planner>` (nếu bạn thích dùng thẳng tag thay vì `<OptimizePlanner>`), và **hook** nếu tự dựng UI:

```tsx
import { FleetworkProvider, useOptimize } from '@vietmap/optimize-sdk/react'
// <FleetworkProvider apiKey="X_API_KEY"><MyComponent /></FleetworkProvider>
// const { optimize, data, isLoading, error } = useOptimize()
```

## 4) Vue

Khai báo tag là custom element trong `vite.config.ts`:

```ts
vue({ template: { compilerOptions: { isCustomElement: (t) => t.startsWith('vietmap-') } } })
```

Rồi `import '@vietmap/optimize-sdk/elements'` và bind thẳng trong template — object/array dùng modifier **`.prop`** (set DOM property), chuỗi dùng attribute, sự kiện dùng `@`. Không cần ref hay wiring thủ công (xem `examples/vue-demo`):

```vue
<vietmap-optimize-planner
  :api-key="apiKey" :tile-key="mapKey" :day="day"
  :vehicles.prop="vehicles" :jobs.prop="jobs"
  @vm-daychange="onDayChange" />
```

## 5) Framework khác (Angular, Svelte, vanilla…)

Cùng **một web component** (`import '@vietmap/optimize-sdk/elements'`) cho mọi nơi — chỉ khác cú pháp bind. Quy tắc chung: **object/array → DOM property, chuỗi → attribute, sự kiện → listener**.

| | `jobs` / `vehicles` (array) | `day` / key (chuỗi) | sự kiện |
| --- | --- | --- | --- |
| **Vanilla** | `el.jobs = jobs` | `el.day = '…'` | `el.addEventListener('vm-daychange', …)` |
| **Vue** | `:jobs.prop="jobs"` | `:day="day"` | `@vm-daychange="…"` |
| **Angular** \* | `[jobs]="jobs"` | `[day]="day"` | `(vm-daychange)="…($event)"` |
| **Svelte** | `jobs={jobs}` | `day={day}` | `on:vm-daychange={…}` |

\* Angular cần `CUSTOM_ELEMENTS_SCHEMA` trong module/component.

React là framework khó tính nhất với custom element, nên SDK **ship sẵn `<OptimizePlanner>`** (mục 3) để bạn khỏi đụng tới ref.

## Phát triển

```bash
pnpm install
pnpm build       # build @vietmap/optimize-sdk (core + elements + react)
pnpm typecheck
pnpm --dir examples/react-demo dev   # http://localhost:5180
pnpm --dir examples/vue-demo dev     # http://localhost:5181
```

## Phát hành (versioning + npm)

Quản lý version bằng [Changesets](https://github.com/changesets/changesets):

```bash
pnpm changeset          # ghi lại thay đổi (chọn major/minor/patch + mô tả)
pnpm changeset:version  # áp changeset: bump version + sinh CHANGELOG
pnpm release            # build rồi publish lên npm
```

Cần `npm login` với quyền publish scope `@vietmap` trước khi chạy `pnpm release`.

## License

MIT © VietMap
