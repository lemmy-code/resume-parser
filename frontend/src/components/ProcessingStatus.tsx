import { useEffect, useRef, useState } from "react";
import { getStatus } from "@/api/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface ProcessingStatusProps {
  resumeId: string;
  onComplete: (resumeId: string) => void;
  onFailed: () => void;
}

export function ProcessingStatus({
  resumeId,
  onComplete,
  onFailed,
}: ProcessingStatusProps) {
  const [status, setStatus] = useState<string>("pending");
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await getStatus(resumeId);
        setStatus(res.status);

        if (res.status === "completed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onComplete(resumeId);
        } else if (res.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setError("Resume processing failed. Please try again.");
          onFailed();
        }
      } catch {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setError("Lost connection while checking status.");
        onFailed();
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [resumeId, onComplete, onFailed]);

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardContent className="flex flex-col items-center gap-5 py-10">
        {error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
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
                <circle cx="12" cy="12" r="10" />
                <line x1="15" x2="9" y1="9" y2="15" />
                <line x1="9" x2="15" y1="9" y2="15" />
              </svg>
            </div>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : (
          <>
            <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
              <svg
                className="size-5 animate-spin text-primary"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>

            <p className="text-sm font-medium text-foreground">
              {status === "pending"
                ? "Waiting to process..."
                : "Analyzing resume with AI..."}
            </p>

            <div className="flex w-full flex-col gap-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
