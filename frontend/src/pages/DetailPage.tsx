import { useEffect, useState } from "react"
import { useParams, Link } from "react-router-dom"
import { getResume } from "@/api/client"
import { ResumeResult } from "@/components/ResumeResult"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"

interface Resume {
  resumeId: string
  status: string
  uploadedAt: string
  parsedData?: {
    fullName: string
    email: string
    phone: string | null
    location: string | null
    summary: string | null
    totalYearsExperience: number
    skills: string[]
    languages: string[]
    experience: {
      company: string
      role: string
      startDate: string
      endDate: string | null
      current: boolean
      description: string
    }[]
    education: {
      institution: string
      degree: string
      field: string
      graduationYear: number | null
    }[]
    certifications: string[]
  }
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>()
  const [resume, setResume] = useState<Resume | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return

    async function fetchResume() {
      setLoading(true)
      setError(null)
      try {
        const data = await getResume(id!)
        setResume(data)
      } catch {
        setError("Resume not found or failed to load.")
      } finally {
        setLoading(false)
      }
    }

    fetchResume()
  }, [id])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3 rounded-xl border p-6">
          <Skeleton className="h-6 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
        <div className="space-y-3 rounded-xl border p-6">
          <Skeleton className="h-6 w-1/4" />
          <div className="flex gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-5 w-18 rounded-full" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !resume) {
    return (
      <div className="space-y-4">
        <p className="text-destructive">{error || "Resume not found."}</p>
        <Button variant="outline" asChild>
          <Link to="/search">Back to Search</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Button variant="outline" asChild>
        <Link to="/search">Back to Search</Link>
      </Button>
      <ResumeResult {...resume} />
    </div>
  )
}
