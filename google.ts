import { join } from "path";
import { mkdir } from "fs/promises";
import { randomUUID } from "crypto";
import { HTTPRequest, type Cookie } from "rebrowser-puppeteer-core";
import { connect, type PageWithCursor } from "puppeteer-real-browser";
import type {
  Project,
  Workflow,
  UserProject,
  ProjectResponse,
  SearchUserProjectsOptions,
  SearchUserProjectsResponse,
  SearchProjectWorkflowsOptions,
  SearchProjectWorkflowsResponse,
  Operation,
} from "./type";
import { existsSync } from "fs";

let USER_AGENT = "";
const BASE_API_URL = "https://labs.google/fx/api/trpc";
const TARGET_PAGE_URL = new URL("https://labs.google/fx/vi/tools/flow");
const APP_RE = /\/_next\/static\/chunks\/pages\/_app-[^/]+\.js(\?.*)?$/;

async function checkLogined(page: PageWithCursor) {
  const startButton = await page.$(
    'xpath=//*[@id="hero"]/div[1]/div[2]/button'
  );
  return !Boolean(startButton);
}

function filterCookiesByUrlDomain(cookies: Cookie[], targetUrl: URL): Cookie[] {
  const host = targetUrl.hostname;

  return cookies.filter((cookie) => {
    const domain = cookie.domain.startsWith(".")
      ? cookie.domain.slice(1)
      : cookie.domain;

    // RFC: request-host === domain OR endsWith .domain
    return host === domain || host.endsWith(`.${domain}`);
  });
}

function toHeaderCookie(cookies: Cookie[]) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}

function encodeCursor(cursor: string | null) {
  if (cursor === null) return null;
  return encodeURIComponent(cursor).replace(/%20/g, "+");
}

function createTimeoutController(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    cancel: () => clearTimeout(timeout),
  };
}

async function searchUserProjects(
  cookies: Cookie[],
  options: SearchUserProjectsOptions = {}
) {
  const cookieHeader = toHeaderCookie(cookies);

  const cursor = options.cursor ?? null;
  const encodedCursor = encodeCursor(cursor);
  const input: Record<string, any> = {
    json: {
      pageSize: options.pageSize ?? 20,
      toolName: options.toolName ?? "PINHOLE",
      cursor: encodedCursor,
    },
  };

  if (cursor === null) {
    input["meta"] = {
      values: {
        cursor: ["undefined"],
      },
    };
  }

  const url = new URL(BASE_API_URL + "/project.searchUserProjects");
  url.searchParams.set("input", JSON.stringify(input));

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "*/*",
      cookie: cookieHeader,
      "user-agent": USER_AGENT,
      referer: TARGET_PAGE_URL.href,
      origin: TARGET_PAGE_URL.origin,
      "content-type": "application/json",
    },
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Tim project that bai: ${response.status} ${response.statusText} - ${responseBody}`
    );
  }

  const data = JSON.parse(responseBody) as SearchUserProjectsResponse;
  const result = data.result.data.json.result;

  return {
    raw: data,
    projects: result.projects,
    nextPageToken: result.nextPageToken ?? null,
  };
}

async function searchAllUserProjects(
  cookies: Cookie[],
  options: SearchUserProjectsOptions = {}
) {
  const projects: UserProject[] = [];

  let cursor = options.cursor ?? null;
  while (true) {
    const page = await searchUserProjects(cookies, { ...options, cursor });

    projects.push(...(page?.projects || []));

    if (!page.nextPageToken) break;
    cursor = page.nextPageToken;
  }

  return projects;
}

async function searchProjectWorkflows(
  cookies: Cookie[],
  project: Project,
  options: SearchProjectWorkflowsOptions = {}
) {
  const cookieHeader = toHeaderCookie(cookies);

  const cursor = options.cursor ?? null;
  const encodedCursor = encodeCursor(cursor);
  const input: Record<string, any> = {
    json: {
      pageSize: options.pageSize ?? 3,
      projectId: project.projectId,
      toolName: options.toolName ?? "PINHOLE",
      fetchBookmarked: options.fetchBookmarked ?? false,
      rawQuery: options.rawQuery ?? "",
      mediaType: options.mediaType ?? "MEDIA_TYPE_VIDEO",
      cursor: encodedCursor,
    },
  };

  if (cursor === null) {
    input["meta"] = {
      values: {
        cursor: ["undefined"],
      },
    };
  }

  const url = new URL(BASE_API_URL + "/project.searchProjectWorkflows");
  url.searchParams.set("input", JSON.stringify(input));

  const refererUrl = new URL(
    `/fx/tools/flow/project/${project.projectId}`,
    TARGET_PAGE_URL.href
  );

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "*/*",
      cookie: cookieHeader,
      "user-agent": USER_AGENT,
      referer: refererUrl.href,
      origin: TARGET_PAGE_URL.origin,
      "content-type": "application/json",
    },
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Tim workflow that bai: ${response.status} ${response.statusText} - ${responseBody}`
    );
  }

  const data = JSON.parse(responseBody) as SearchProjectWorkflowsResponse;
  const result = data.result.data.json.result;
  const nextPageToken = result.nextPageToken ?? null;

  return {
    raw: data,
    nextPageToken,
    workflows: result.workflows,
  };
}

async function searchAllProjectWorkflows(
  cookies: Cookie[],
  project: Project,
  options: SearchProjectWorkflowsOptions = {}
) {
  const workflows: Workflow[] = [];

  let cursor = options.cursor ?? null;
  while (true) {
    const page = await searchProjectWorkflows(cookies, project, {
      ...options,
      cursor,
    });

    workflows.push(...page.workflows);

    if (!page.nextPageToken) break;
    cursor = page.nextPageToken;
  }

  return workflows;
}

async function createProject(
  cookies: Cookie[],
  projectTitle = new Date().toISOString(),
  toolName = "PINHOLE"
) {
  const cookieHeader = toHeaderCookie(cookies);

  const response = await fetch(BASE_API_URL + "/project.createProject", {
    method: "POST",
    headers: {
      accept: "*/*",
      cookie: cookieHeader,
      "user-agent": USER_AGENT,
      referer: TARGET_PAGE_URL.href,
      origin: TARGET_PAGE_URL.origin,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: { toolName, projectTitle } }),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Tạo project thất bại: ${response.status} ${response.statusText} - ${responseBody}`
    );
  }

  const data = JSON.parse(responseBody) as ProjectResponse<Project>;

  return {
    raw: data,
    project: data.result.data.json.result,
  };
}

type VideoModelKey = "veo_3_1_t2v_fast_portrait" | "veo_3_1_t2v_portrait";

async function setLastSelectedVideoModelKey(
  cookies: Cookie[],
  project: Project,
  modelKey: VideoModelKey
) {
  const cookieHeader = toHeaderCookie(cookies);

  const refererUrl = new URL(
    `/fx/tools/flow/project/${project.projectId}`,
    TARGET_PAGE_URL.href
  );

  return fetch(BASE_API_URL + "/videoFx.setLastSelectedVideoModelKey", {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      referer: refererUrl.href,
      "user-agent": USER_AGENT,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: { modelKey } }),
  });
}

type VideoAspectRatio =
  | "VIDEO_ASPECT_RATIO_LANDSCAPE"
  | "VIDEO_ASPECT_RATIO_PORTRAIT";

async function setLastSelectedVideoAspectRatio(
  cookies: Cookie[],
  project: Project,
  videoAspectRatio: VideoAspectRatio
) {
  const cookieHeader = toHeaderCookie(cookies);

  const refererUrl = new URL(
    `/fx/tools/flow/project/${project.projectId}`,
    TARGET_PAGE_URL.href
  );

  return fetch(BASE_API_URL + "/videoFx.setLastSelectedVideoAspectRatio", {
    method: "POST",
    headers: {
      cookie: cookieHeader,
      referer: refererUrl.href,
      "user-agent": USER_AGENT,
      "content-type": "application/json",
    },
    body: JSON.stringify({ json: { videoAspectRatio } }),
  });
}

type LastSettings = {
  lastSelectedVideoModelKey: string;
  lastAcknowledgedChangeLogId: string;
  lastSelectedVideoAspectRatio: string;
};

async function getUserSettings(cookies: Cookie[], project: Project) {
  const cookieHeader = toHeaderCookie(cookies);

  const refererUrl = new URL(
    `/fx/tools/flow/project/${project.projectId}`,
    TARGET_PAGE_URL.href
  );

  const url = new URL(
    "https://labs.google/fx/api/trpc/videoFx.getUserSettings"
  );

  url.searchParams.set(
    "input",
    JSON.stringify({ json: null, meta: { values: ["undefined"] } })
  );
  const response = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      referer: refererUrl.href,
      "user-agent": USER_AGENT,
      "content-type": "application/json",
    },
  });

  const responseBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Tạo project thất bại: ${response.status} ${response.statusText} - ${responseBody}`
    );
  }

  const data = JSON.parse(responseBody) as ProjectResponse<LastSettings>;

  return data.result.data.json.result;
}

async function patchApp(req: HTTPRequest) {
  try {
    const res = await fetch(req.url(), { headers: req.headers() as any });
    let body = await res.text();

    // Patch: sau khi khai báo _0x50930e, gắn nó lên window
    // (Bạn cần tìm đúng điểm chèn - ví dụ sau "var _0x50930e = async" hoặc ", _0x50930e = async")
    body = body.replace(
      /([,;]\s*_0x50930e\s*=\s*)async\b/,
      "$1window.__recaptchaFn=async"
    );

    await req.respond({
      status: res.status,
      headers: {
        ...Object.fromEntries(res.headers.entries()),
        "content-type": "application/javascript; charset=utf-8",
      },
      body,
    });
  } catch (e) {
    console.error("patch failed", e);
    req.continue();
  }
}

function genSeed(..._: any) {
  let _0xcd06f =
    arguments.length > 0x0 && void 0x0 !== arguments[0x0]
      ? arguments[0x0]
      : 0xf4240;
  return Math.floor(Math.random() * _0xcd06f);
}

type Veo3Options = {
  project: Project;
  isSeedLocked: boolean;
  recaptchaToken: string;
  outputsPerPrompt: number;
  videoModelKey: VideoModelKey;
  aspectRatio: VideoAspectRatio;
  requestTimeoutMs?: number;
  statusTimeoutMs?: number;
};

type Session = {
  user: {
    name: string;
    image: string;
  };
  access_token: string;
};

async function createVideoText(
  cookies: Cookie[],
  session: Session,
  prompt: string,
  options: Veo3Options
): Promise<Operation[]> {
  await setLastSelectedVideoModelKey(
    cookies,
    options.project,
    options.videoModelKey
  );
  await setLastSelectedVideoAspectRatio(
    cookies,
    options.project,
    options.aspectRatio
  );

  const payload = {
    clientContext: {
      tool: "PINHOLE",
      sessionId: ";" + Date.now(),
      projectId: options.project.projectId,
      userPaygateTier: "PAYGATE_TIER_TWO",
      recaptchaToken: options.recaptchaToken,
    },
    requests: Array(options.outputsPerPrompt)
      .fill(null)
      .map(() => ({
        aspectRatio: options.aspectRatio,
        seed: options.isSeedLocked ? 1234567 : genSeed(0x7fff),
        textInput: {
          prompt,
        },
        videoModelKey: options.videoModelKey,
        metadata: {
          sceneId: randomUUID(),
        },
      })),
  };

  const headers = new Headers({
    "user-agent": USER_AGENT,
    "content-type": "text/plain",
    origin: TARGET_PAGE_URL.origin,
    referer: TARGET_PAGE_URL.origin + "/",
    authorization: "Bearer " + session.access_token,
  });

  const baseUrl = "https://aisandbox-pa.googleapis.com/v1";
  const requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
  const statusTimeoutMs = options.statusTimeoutMs ?? 30_000;

  const createController = createTimeoutController(requestTimeoutMs);
  const response = await fetch(baseUrl + "/video:batchAsyncGenerateVideoText", {
    headers,
    method: "POST",
    body: JSON.stringify(payload),
    signal: createController.signal,
  }).finally(createController.cancel);

  const responseBody = await response.text();

  if (!response.ok)
    throw new Error(
      `Tạo video thất bại: ${response.status} ${response.statusText} - ${responseBody}`
    );

  let { operations } = JSON.parse(responseBody);

  const statusMap = new Map<string, Operation>(
    operations.map((op: any) => [op.sceneId, op])
  );

  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(async () => {
      try {
        attempts += 1;
        if (attempts > 100) {
          clearInterval(interval);
          throw new Error("Vượt quá 100 lần kiểm tra trạng thái video");
        }

        if (operations.length === 0) {
          clearInterval(interval);
          return resolve([...statusMap.values()]);
        } else {
          const statusController = createTimeoutController(statusTimeoutMs);
          const response = await fetch(
            baseUrl + "/video:batchCheckAsyncVideoGenerationStatus",
            {
              headers,
              method: "POST",
              body: JSON.stringify({ operations }),
              signal: statusController.signal,
            }
          ).finally(statusController.cancel);

          if (!response.ok)
            throw new Error("Kiểm tra trạng thái video không thành công");

          const data: any = await response.json();
          operations = data.operations.filter((op: any) => {
            if (
              typeof op.operation === "object" &&
              op.status === "MEDIA_GENERATION_STATUS_SUCCESSFUL"
            ) {
              statusMap.set(op.sceneId, op);
            }
            return op.status !== "MEDIA_GENERATION_STATUS_SUCCESSFUL";
          });
        }
      } catch (error) {
        console.log(error);
      }
    }, 2000);
  });
}

async function download(
  operations: Operation[],
  videoDir: string,
  timeoutMs = 5 * 60_000
) {
  if (!existsSync(videoDir)) await mkdir(videoDir, { recursive: true });

  let index = 0;
  for (const { operation } of operations) {
    index++;
    let fileName =
      operation.metadata.video.prompt.match(/^\[(.*?)\]/)?.[1] ??
      operation.name;

    if (operations.length > 1) {
      fileName += `(${index})`;
    }
    fileName += ".mp4";

    const filePath = join(videoDir, fileName);

    const downloadUrl = operation.metadata.video.fifeUrl;
    const downloadController = createTimeoutController(timeoutMs);
    const response = await fetch(downloadUrl, {
      headers: { "user-agent": USER_AGENT },
      signal: downloadController.signal,
    }).finally(downloadController.cancel);
    if (!response.ok || !response.body) {
      throw new Error(
        `Tải xuống video thất bại: ${response.status} ${response.statusText}`
      );
    }

    const fileWriter = Bun.file(filePath).writer();
    for await (const chunk of response.body) {
      fileWriter.write(chunk);
    }
    fileWriter.end();
  }
}

async function main() {
  const promptPath = join(process.cwd(), "prompts.txt");
  const promptFile = Bun.file(promptPath);

  const promptRaw = await promptFile.text();
  const prompts = promptRaw
    .trim()
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  const { page, browser } = await connect({
    headless: false,
    connectOption: {
      defaultViewport: null,
    },
  });

  const cookiePath = join(process.cwd(), "cookie.json");
  const cookieFile = Bun.file(cookiePath);

  const cookieFileExists = await cookieFile.exists();
  if (!cookieFileExists) throw new Error("Không tìm thấy file cookie.json");

  const jsonCookie = await cookieFile.json();

  await browser.setCookie(...jsonCookie);

  await page.setRequestInterception(true);

  page.on("request", async (req) => {
    const url = req.url();
    if (!APP_RE.test(url)) return req.continue();
    await patchApp(req);
  });

  await page.goto(TARGET_PAGE_URL.href, { waitUntil: "load" });
  const isLogined = await checkLogined(page);

  if (!isLogined) throw new Error("Không thể đăng nhập bằng cookie hiện tại");

  USER_AGENT = await page.evaluate(() => navigator.userAgent);

  const browserCookies = await browser.cookies();
  const pageCookies = filterCookiesByUrlDomain(browserCookies, TARGET_PAGE_URL);

  await cookieFile.write(JSON.stringify(pageCookies));

  const projects = await searchAllUserProjects(pageCookies);

  if (projects.length === 0) {
    const { project } = await createProject(pageCookies);
    projects.push(project);
  }

  const project = projects[0]!;

  console.log(
    "Đang sử dụng dự án:",
    project.projectInfo.projectTitle,
    project.projectId
  );

  // @ts-ignore
  await page.waitForFunction(() => typeof window.__recaptchaFn === "function", {
    timeout: 5000,
  });

  await Bun.sleep(5000);

  const startProjectUrl = `${TARGET_PAGE_URL.href}/project/${project.projectId}`;
  await page.goto(startProjectUrl, { waitUntil: "load" });

  const videoDir = join(process.cwd(), "videos", project.projectId);

  // Get access_token
  const session: Session = await page.$eval(
    "#__NEXT_DATA__",
    (el) => JSON.parse(el.textContent).props.pageProps.session
  );

  let done = 1;

  const lastSettings = await getUserSettings(pageCookies, project);

  for (const prompt of prompts) {
    const start = performance.now();

    await Bun.sleep(5000);
    // Get recaptchaToken
    const recaptchaToken: string | undefined = await page.evaluate(
      async (action) => {
        // @ts-ignore
        const fn = window.__recaptchaFn;
        return typeof fn === "function" ? await fn(action) : undefined;
      },
      "FLOW_GENERATION"
    );

    if (!recaptchaToken)
      throw new Error(
        "Không thể lấy mã recaptcha, vui lòng liên nhà phát triển"
      );

    console.log(`[${done}/${prompts.length}] Đang tạo video: ${prompt}`);
    const result = await createVideoText(pageCookies, session, prompt, {
      project,
      recaptchaToken,
      isSeedLocked: false,
      outputsPerPrompt: 1,
      videoModelKey: lastSettings.lastSelectedVideoModelKey as any,
      aspectRatio: lastSettings.lastSelectedVideoAspectRatio as any,
    });

    console.log(`[${done}/${prompts.length}] Đang tải xuống các video`);
    await download(result, videoDir);

    const end = performance.now();
    const totalTime = end - start;
    const totalSeconds = Math.round(totalTime / 1000);
    console.log(
      `[${done}/${prompts.length}] Hoàn thành lúc trong: ${totalSeconds} giây\n`
    );

    done++;
  }

  await Bun.sleep(5000);

  await page.close();

  await browser.close();
}

main().then().catch(console.error);
