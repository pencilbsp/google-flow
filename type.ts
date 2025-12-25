export type Project = {
  projectId: string;
  projectInfo: {
    projectTitle: string;
  };
};

export type ProjectResponse<T> = {
  result: {
    data: {
      json: {
        result: T;
        status: number;
        statusText: string;
      };
    };
  };
};

export type SearchProjectWorkflowsOptions = {
  pageSize?: number;
  toolName?: string;
  rawQuery?: string;
  mediaType?: string;
  cursor?: string | null;
  fetchBookmarked?: boolean;
};

export type MediaGenerationId = {
  mediaType: string;
  projectId: string;
  workflowId: string;
  workflowStepId: string;
  mediaKey: string;
};

export type GeneratedVideo = {
  seed: number;
  mediaGenerationId: string;
  prompt: string;
  aspectRatio: string;
};

export type VideoData = {
  generatedVideo: GeneratedVideo;
  fifeUri: string;
  servingBaseUri: string;
};

export type MediaData = {
  videoData?: VideoData;
};

export type MediaExtraData = {
  mediaTitle: string;
  toolName: string;
  mediaType: string;
  videoExtraData: Record<string, unknown>;
};

export type MediaGeneration = {
  mediaGenerationId: MediaGenerationId;
  mediaData: MediaData;
  mediaExtraData: MediaExtraData;
};

export type ToolInfo = {
  toolName: string;
};

export type VideoModelControlInput = {
  videoModelName: string;
  videoGenerationMode: string;
  videoModelDisplayName: string;
  videoAspectRatio: string;
};

export type VideoGenerationRequestData = {
  videoModelControlInput: VideoModelControlInput;
};

export type PromptInput = {
  textInput: string;
};

export type RequestData = {
  videoGenerationRequestData?: VideoGenerationRequestData;
  promptInputs?: PromptInput[];
};

export type WorkflowStepLog = {
  stepCreationTime: string;
  requestData: RequestData;
};

export type WorkflowStep = {
  workflowStepId: string;
  toolInfo: ToolInfo;
  mediaGenerations: MediaGeneration[];
  workflowStepLog: WorkflowStepLog;
};

export type Workflow = {
  workflowId: string;
  workflowSteps: WorkflowStep[];
  createTime: string;
};

export type WorkflowResult = {
  workflows: Workflow[];
  nextPageToken?: string | null;
};

export type SearchProjectWorkflowsResponse = ProjectResponse<WorkflowResult>;

export type SearchUserProjectsOptions = {
  pageSize?: number;
  toolName?: string;
  cursor?: string | null;
};

export type UserProject = Project & {
  creationTime?: string;
};

export type UserProjectsResult = {
  projects: UserProject[];
  nextPageToken?: string | null;
};

export type SearchUserProjectsResponse = ProjectResponse<UserProjectsResult>;

export type Operation = {
  operation: {
    name: string;
    metadata: {
      "@type": string;
      name: string;
      video: {
        seed: number;
        mediaGenerationId: string;
        prompt: string;
        fifeUrl: string;
        mediaVisibility: string;
        servingBaseUri: string;
        model: string;
        isLooped: boolean;
        aspectRatio: string;
      };
    };
  };
  sceneId: string;
  mediaGenerationId: string;
  status: string;
};

export type VideoModel = {
  key: string;
  supportedAspectRatios: string[];
  accessType: string;
  capabilities: string[];
  videoLengthSeconds: number;
  videoGenerationTimeSeconds: number;
  displayName: string;
  creditCost: number;
  framesPerSecond: number;
  paygateTier: string;
  modelAccessInfo: {
    paygateAccessBlocked?: boolean;
  };
  modelMetadata: {
    veoModelName?: string;
    modelQuality?: string;
  };
  modelStatus?: string;
  shareCardDisplayName: string;
  supportedResolutions?: string[];
};
