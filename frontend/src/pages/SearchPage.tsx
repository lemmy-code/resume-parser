import { useEffect, useState } from "react"
import { searchResumes } from "@/api/client"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ResumeCard } from "@/components/ResumeCard"

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

export default function SearchPage() {
  const [skill, setSkill] = useState("")
  const [resumes, setResumes] = useState<Resume[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchResumes(filter?: string) {
    setLoading(true)
    try {
      const data = await searchResumes(filter || undefined)
      setResumes(data)
    } catch {
      setResumes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchResumes()
  }, [])

  function handleSearch() {
    fetchResumes(skill.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSearch()
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <h1 className="text-2xl font-bold">Search Resumes</h1>

      <div className="flex gap-2">
        <Input
          placeholder="Filter by skill..."
          value={skill}
          onChange={(e) => setSkill(e.target.value)}
          onKeyDown={handleKeyDown}
          className="max-w-sm"
        />
        <Button onClick={handleSearch}>Search</Button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border p-6">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-14 rounded-full" />
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-5 w-12 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : resumes.length === 0 ? (
        <p className="text-muted-foreground">
          No resumes found. Try a different skill or upload a resume first.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {resumes.map((resume) => (
            <ResumeCard key={resume.resumeId} resume={resume} />
          ))}
        </div>
      )}
    </div>
  )
}
