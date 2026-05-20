import { Outlet } from 'react-router-dom'

export default function PortfolioLayout() {
  return (
    <div className="space-y-5">
      <Outlet />
    </div>
  )
}
