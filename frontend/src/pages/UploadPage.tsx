import { useCallback, useState } from "react";
import { requestUpload, uploadFile, getResume } from "@/api/client";
import { FileDropzone } from "@/components/FileDropzone";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { ResumeResult } from "@/components/ResumeResult";
import { Button } from "@/components/ui/button";

type FlowState = "idle" | "uploading" | "processing" | "completed" | "failed";

interface ResumeData {
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

export default function UploadPage() {
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [resumeId, setResumeId] = useState<string>("");
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [error, setError] = useState<string>("");

  const handleUpload = useCallback(async (file: File) => {
    setFlowState("uploading");
    setError("");

    try {
      const { resumeId: id, uploadUrl } = await requestUpload(file.name);
      await uploadFile(uploadUrl, file);
      setResumeId(id);
      setFlowState("processing");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Upload failed. Please try again.";
      setError(message);
      setFlowState("failed");
    }
  }, []);

  const handleComplete = useCallback(async (id: string) => {
    try {
      const data = await getResume(id);
      setResumeData(data);
      setFlowState("completed");
    } catch {
      setError("Failed to load resume results. Please try again.");
      setFlowState("failed");
    }
  }, []);

  const handleFailed = useCallback(() => {
    setError(
      "Resume processing failed. The file may be corrupted or unsupported."
    );
    setFlowState("failed");
  }, []);

  const handleRetry = useCallback(() => {
    setFlowState("idle");
    setResumeId("");
    setResumeData(null);
    setError("");
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Resume Parser</h1>
        <p className="mt-2 text-muted-foreground">
          Upload a PDF resume and let AI extract structured data in seconds.
        </p>
      </div>

      {flowState === "idle" && (
        <FileDropzone onUpload={handleUpload} isUploading={false} />
      )}

      {flowState === "uploading" && (
        <FileDropzone onUpload={handleUpload} isUploading={true} />
      )}

      {flowState === "processing" && resumeId && (
        <ProcessingStatus
          resumeId={resumeId}
          onComplete={handleComplete}
          onFailed={handleFailed}
        />
      )}

      {flowState === "completed" && resumeData && (
        <div className="flex flex-col gap-6">
          <ResumeResult {...resumeData} />
          <div className="flex justify-center pb-8">
            <Button variant="outline" onClick={handleRetry}>
              Upload Another Resume
            </Button>
          </div>
        </div>
      )}

      {flowState === "failed" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-destructive/20 bg-destructive/5 px-6 py-12 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-destructive"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div>
            <p className="font-medium text-destructive">Something went wrong</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
          <Button onClick={handleRetry}>Try Again</Button>
        </div>
      )}
    </div>
  );
}
