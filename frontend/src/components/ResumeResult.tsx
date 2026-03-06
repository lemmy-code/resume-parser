import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ResumeResultProps {
  resumeId: string;
  status: string;
  uploadedAt: string;
  parsedData?: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
    summary: string | null;
    totalYearsExperience: number;
    skills: string[];
    languages: string[];
    experience: {
      company: string;
      role: string;
      startDate: string;
      endDate: string | null;
      current: boolean;
      description: string;
    }[];
    education: {
      institution: string;
      degree: string;
      field: string;
      graduationYear: number | null;
    }[];
    certifications: string[];
  };
}

export function ResumeResult({ parsedData }: ResumeResultProps) {
  if (!parsedData) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No parsed data available.
        </CardContent>
      </Card>
    );
  }

  const {
    fullName,
    email,
    phone,
    location,
    summary,
    totalYearsExperience,
    skills,
    languages,
    experience,
    education,
    certifications,
  } = parsedData;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <h2 className="text-2xl font-bold tracking-tight">{fullName}</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              {email}
            </span>
            {phone && (
              <span className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                {phone}
              </span>
            )}
            {location && (
              <span className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                {location}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle>Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill) => (
                <Badge key={skill} variant="secondary">
                  {skill}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Experience</CardTitle>
            <CardDescription>
              {totalYearsExperience} years total experience
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-6">
              {experience.map((exp, i) => (
                <div
                  key={`${exp.company}-${exp.role}-${i}`}
                  className={`flex flex-col gap-1 ${
                    i < experience.length - 1
                      ? "border-b border-border pb-6"
                      : ""
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                    <h4 className="text-sm font-semibold">{exp.role}</h4>
                    <span className="text-xs text-muted-foreground">
                      {exp.startDate} &ndash;{" "}
                      {exp.current ? "Present" : exp.endDate}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{exp.company}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground/80">
                    {exp.description}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Education */}
      {education.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Education</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-4">
              {education.map((edu, i) => (
                <div
                  key={`${edu.institution}-${i}`}
                  className={`flex flex-col gap-0.5 ${
                    i < education.length - 1
                      ? "border-b border-border pb-4"
                      : ""
                  }`}
                >
                  <h4 className="text-sm font-semibold">{edu.institution}</h4>
                  <p className="text-sm text-muted-foreground">
                    {edu.degree} in {edu.field}
                  </p>
                  {edu.graduationYear && (
                    <p className="text-xs text-muted-foreground">
                      {edu.graduationYear}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Certifications</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {certifications.map((cert) => (
                <li
                  key={cert}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
                  {cert}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Languages</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {languages.map((lang) => (
                <Badge key={lang} variant="outline">
                  {lang}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
