import { useNavigate } from "react-router-dom"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

interface ResumeCardProps {
  resume: {
    resumeId: string
    parsedData?: {
      fullName: string
      email: string
      skills: string[]
      totalYearsExperience: number
      location: string | null
    }
  }
}

export function ResumeCard({ resume }: ResumeCardProps) {
  const navigate = useNavigate()
  const { parsedData } = resume

  if (!parsedData) return null

  const topSkills = parsedData.skills.slice(0, 5)

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/resumes/${resume.resumeId}`)}
    >
      <CardHeader>
        <CardTitle>{parsedData.fullName}</CardTitle>
        <CardDescription>
          {parsedData.totalYearsExperience} years experience
          {parsedData.location && ` · ${parsedData.location}`}
        </CardDescription>
      </CardHeader>
      {topSkills.length > 0 && (
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {topSkills.map((skill) => (
              <Badge key={skill} variant="secondary">
                {skill}
              </Badge>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}
