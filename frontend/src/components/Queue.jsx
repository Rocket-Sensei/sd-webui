import { useEffect, useState } from "react";
import { Clock, CheckCircle2, XCircle, Loader2, List as ListIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

const QUEUE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

const STATUS_CONFIG = {
  [QUEUE_STATUS.PENDING]: {
    icon: Clock,
    label: "Queued",
    color: "secondary",
  },
  [QUEUE_STATUS.PROCESSING]: {
    icon: Loader2,
    label: "Processing",
    color: "default",
    animate: true,
  },
  [QUEUE_STATUS.COMPLETED]: {
    icon: CheckCircle2,
    label: "Completed",
    color: "outline",
    variant: "success",
  },
  [QUEUE_STATUS.FAILED]: {
    icon: XCircle,
    label: "Failed",
    color: "destructive",
  },
};

export function Queue() {
  const [jobs, setJobs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
    // Poll for updates every 2 seconds
    const interval = setInterval(fetchQueue, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const response = await fetch("/api/queue");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG[QUEUE_STATUS.PENDING];
  };

  const activeJobs = jobs.filter(j => j.status !== QUEUE_STATUS.COMPLETED && j.status !== QUEUE_STATUS.FAILED);
  const completedJobs = jobs.filter(j => j.status === QUEUE_STATUS.COMPLETED);
  const failedJobs = jobs.filter(j => j.status === QUEUE_STATUS.FAILED);

  if (jobs.length === 0 && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            Generation Queue
          </CardTitle>
          <CardDescription>
            Queue and manage your image generation jobs
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12">
          <div className="text-center">
            <ListIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Queue is empty</h3>
            <p className="text-muted-foreground">
              Generate images and they will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListIcon className="h-5 w-5" />
          Generation Queue
        </CardTitle>
        <CardDescription>
          {activeJobs.length > 0
            ? `${activeJobs.length} job${activeJobs.length > 1 ? "s" : ""} in queue`
            : "No active jobs"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.map((job) => {
          const config = getStatusConfig(job.status);
          const StatusIcon = config.icon;

          return (
            <div
              key={job.id}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{job.prompt || "No prompt"}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {job.model} • {job.size || "512x512"}
                    {job.seed && ` • Seed: ${job.seed}`}
                  </p>
                </div>
                <Badge variant={config.color} className="ml-2 flex-shrink-0">
                  <StatusIcon className={`h-3 w-3 mr-1 ${config.animate ? "animate-spin" : ""}`} />
                  {config.label}
                </Badge>
              </div>

              {job.status === QUEUE_STATUS.PROCESSING && job.progress !== undefined && (
                <Progress value={job.progress * 100} className="h-2" />
              )}

              {job.status === QUEUE_STATUS.FAILED && job.error && (
                <p className="text-xs text-destructive">{job.error}</p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {job.type === "generate" ? "Text to Image" :
                   job.type === "edit" ? "Image to Image" :
                   job.type === "variation" ? "Variation" : job.type}
                </span>
                <span>{new Date(job.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
