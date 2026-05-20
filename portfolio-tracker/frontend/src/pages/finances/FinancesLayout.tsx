import { Outlet } from 'react-router-dom'

export default function FinancesLayout() {
  return (
    <div className="space-y-5">
      <Outlet />
    </div>
  )
}
