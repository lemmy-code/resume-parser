const UPLOAD_API_URL = import.meta.env.VITE_UPLOAD_API_URL || 'http://localhost:3000';
const QUERY_API_URL = import.meta.env.VITE_QUERY_API_URL || 'http://localhost:3000';
const API_KEY = import.meta.env.VITE_API_KEY || 'dev-api-key';

interface UploadResponse {
  resumeId: string;
  uploadUrl: string;
}

interface StatusResponse {
  resumeId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface ResumeResponse {
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

export async function requestUpload(filename: string): Promise<UploadResponse> {
  const res = await fetch(`${UPLOAD_API_URL}/resumes/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ filename }),
  });
  if (!res.ok) throw new Error(`Upload request failed: ${res.status}`);
  return res.json();
}

export async function uploadFile(url: string, file: File): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!res.ok) throw new Error(`File upload failed: ${res.status}`);
}

export async function getStatus(resumeId: string): Promise<StatusResponse> {
  const res = await fetch(`${QUERY_API_URL}/resumes/${resumeId}/status`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!res.ok) throw new Error(`Status check failed: ${res.status}`);
  return res.json();
}

export async function getResume(resumeId: string): Promise<ResumeResponse> {
  const res = await fetch(`${QUERY_API_URL}/resumes/${resumeId}`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!res.ok) throw new Error(`Get resume failed: ${res.status}`);
  return res.json();
}

export async function searchResumes(skill?: string): Promise<ResumeResponse[]> {
  const params = new URLSearchParams();
  if (skill) params.set('skill', skill);
  const res = await fetch(`${QUERY_API_URL}/resumes?${params.toString()}`, {
    headers: { 'x-api-key': API_KEY },
  });
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json();
}
