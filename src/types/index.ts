export interface ExperienceEntry {
  company: string;
  role: string;
  startDate: string;
  endDate: string | null;
  current: boolean;
  description: string;
}

export interface EducationEntry {
  institution: string;
  degree: string;
  field: string;
  graduationYear: number | null;
}

export interface ParsedResumeData {
  fullName: string;
  email: string;
  phone: string | null;
  location: string | null;
  summary: string | null;
  totalYearsExperience: number;
  skills: string[];
  languages: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: string[];
}

export interface ResumeDocument {
  resumeId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  s3Key: string;
  uploadedAt: string;
  parsedData?: ParsedResumeData;
  processedAt?: string;
  errorMessage?: string;
  ttl?: number;
}

export interface ProcessingMessage {
  resumeId: string;
  s3Key: string;
}
