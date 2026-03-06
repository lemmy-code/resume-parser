import { Link, Outlet } from "react-router-dom"

export default function Layout() {
  return (
    <div className="min-h-screen">
      <nav className="border-b">
        <div className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <Link to="/" className="text-lg font-bold">
            ResumeParser
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Upload
          </Link>
          <Link
            to="/search"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Search
          </Link>
        </div>
      </nav>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
