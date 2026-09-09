import { useState } from 'react'
// One idiomatic React component — pass vehicles + a single `jobs` list as PROPS.
import { OptimizePlanner } from '@vietmap/optimize-sdk-react'
import type { PlannerJobInput, PlannerVehicle } from '@vietmap/optimize-sdk-react'

// Keys come from a gitignored .env.local (copy .env.example) — never committed.
const API_KEY = import.meta.env.VITE_OPTIMIZE_KEY ?? '' // X-API-Key (optimize)
const MAP_KEY = import.meta.env.VITE_MAP_KEY ?? '' // VietMap map key

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const today = new Date()
const tomorrow = new Date(today)
tomorrow.setDate(today.getDate() + 1)
const DAY1 = iso(today)
const DAY2 = iso(tomorrow)

const VEHICLES: PlannerVehicle[] = [
  { id: 'xe1', plate: '51C-123.45', name: 'Nguyễn Văn A', vehicleType: 'Xe tải 1.5T', capacity: [1500], start: [106.66017, 10.76262], workingHours: [480, 1080], skills: ['Lạnh', 'Cồng kềnh'], cities: ['Quận 1', 'Quận 3'] },
  { id: 'xe2', plate: '59X1-678.90', name: 'Trần Thị B', vehicleType: 'Xe máy', capacity: [50], start: [106.7, 10.78], workingHours: [480, 1080], skills: ['Giao nhanh'], cities: ['Bình Thạnh'] },
]

// The host owns the day's jobs: pass ONE list — the SDK infers service (single
// `location`) vs shipment (`pickup` + `delivery`) from each item's shape. No
// `kind`, no splitting.
const JOBS_BY_DAY: Record<string, PlannerJobInput[]> = {
  [DAY1]: [
    { id: 'DV-103', code: 'DV-103', name: 'Lắp đặt Điểm C', location: [106.6751, 10.76543], serviceMinutes: 5, skills: ['Lạnh'] },
    { id: 'DV-105', code: 'DV-105', name: 'Bảo trì Điểm E', location: [106.65, 10.75], serviceMinutes: 8 },
    { id: 'DH-201', code: 'ĐH-201', name: 'Đơn Kho→A', pickup: { location: [106.66017, 10.76262], serviceMinutes: 5 }, delivery: { location: [106.70098, 10.77689], serviceMinutes: 10 }, priority: 90, skills: ['Lạnh'] },
    { id: 'DH-202', code: 'ĐH-202', name: 'Đơn Kho→B', pickup: { location: [106.66017, 10.76262] }, delivery: { location: [106.68411, 10.78021] } },
  ],
  [DAY2]: [
    { id: 'DV-210', code: 'DV-210', name: 'Bảo trì Điểm F', location: [106.72, 10.79], serviceMinutes: 8 },
    { id: 'DH-220', code: 'ĐH-220', name: 'Đơn Kho→G', pickup: { location: [106.66017, 10.76262] }, delivery: { location: [106.64, 10.74] } },
  ],
}

/**
 * A minimal, real-world embed: drop <OptimizePlanner> in, pass the keys +
 * vehicles + the day's `jobs`, and swap the jobs when the day changes. No refs,
 * no service/shipment split — the SDK classifies each job for you.
 */
export function App() {
  const [day, setDay] = useState(DAY1)
  const jobs = JOBS_BY_DAY[day] ?? [] // real apps: fetch(`/jobs?day=${day}`)

  return (
    <div style={{ height: '100vh', padding: 16, boxSizing: 'border-box' }}>
      <OptimizePlanner
        apiKey={API_KEY}
        tileKey={MAP_KEY}
        day={day}
        vehicles={VEHICLES}
        jobs={jobs}
        onDayChange={setDay}
        style={{ display: 'block', height: '100%' }}
      />
    </div>
  )
}
