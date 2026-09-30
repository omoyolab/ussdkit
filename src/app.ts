import { UssdkitError } from "./errors.js";
import { MemoryStore } from "./session/memory.js";
import type {
  AppOptions,
  Context,
  Next,
  Screen,
  Session,
  SessionStore,
  UssdRequest,
  UssdResponse,
} from "./types.js";

export interface ResolvedOptions {
  home: string;
  backKey: string | false;
  homeKey: string | false;
  store: SessionStore;
  ttl: number;
  maxLength: number;
  onWarning: (message: string) => void;
  invalidText: string;
}

export interface App {
  readonly options: ResolvedOptions;
  readonly screens: ReadonlyMap<string, Screen>;
  /** Registers a screen. Returns the app so calls chain. */
  screen(id: string, screen: Screen): App;
  /** Handles one gateway request. This is the whole runtime. */
  handle(request: UssdRequest): Promise<UssdResponse>;
}

export function createApp(options: AppOptions = {}): App {
  const resolved: ResolvedOptions = {
    home: options.home ?? "home",
    backKey: options.backKey ?? "0",
    homeKey: options.homeKey ?? "00",
    store: options.store ?? new MemoryStore(),
    ttl: options.ttl ?? 180,
    maxLength: options.maxLength ?? 182,
    onWarning: options.onWarning ?? ((message) => console.warn(`ussdkit: ${message}`)),
    invalidText: options.invalidText ?? "Invalid choice.",
  };
  const screens = new Map<string, Screen>();

  function getScreen(id: string): Screen {
    const screen = screens.get(id);
    if (!screen) {
      throw new UssdkitError(
        `Unknown screen "${id}"`,
        `Register it with app.screen("${id}", ...). Known screens: ${[...screens.keys()].join(", ") || "none"}`,
      );
    }
    return screen;
  }

  function context(session: Session, request: UssdRequest, input: string): Context {
    return {
      input,
      phone: session.phone,
      serviceCode: session.serviceCode,
      network: request.network,
      screen: session.screen,
      data: session.data,
      session,
    };
  }

  async function render(
    session: Session,
    request: UssdRequest,
    prefix?: string,
  ): Promise<UssdResponse> {
    const screen = getScreen(session.screen);
    const ctx = context(session, request, "");
    const body = typeof screen.render === "string" ? screen.render : await screen.render(ctx);
    const text = prefix ? `${prefix}\n${body}` : body;
    if (text.length > resolved.maxLength) {
      resolved.onWarning(
        `screen "${session.screen}" is ${text.length} characters, over the ${resolved.maxLength} limit. Some phones will cut it off.`,
      );
    }
    return { text, end: screen.handle === undefined };
  }

  function goBack(session: Session): void {
    const previous = session.history.pop();
    if (previous !== undefined) session.screen = previous;
  }

  function goHome(session: Session): void {
    session.history = [];
    session.screen = resolved.home;
  }

  async function step(
    session: Session,
    request: UssdRequest,
    input: string,
  ): Promise<UssdResponse> {
    if (resolved.homeKey !== false && input === resolved.homeKey) {
      goHome(session);
      return render(session, request);
    }
    if (resolved.backKey !== false && input === resolved.backKey && session.history.length > 0) {
      goBack(session);
      return render(session, request);
    }

    const screen = getScreen(session.screen);
    if (!screen.handle) {
      // An end screen received input, which means the gateway kept the session open.
      return { ...(await render(session, request)), end: true };
    }

    const next: Next = await screen.handle(context(session, request, input));

    if ("retry" in next) {
      return render(session, request, next.retry);
    }
    if ("end" in next) {
      return { text: next.end, end: true };
    }
    if ("back" in next) {
      goBack(session);
      return render(session, request);
    }
    if ("home" in next) {
      goHome(session);
      return render(session, request);
    }
    getScreen(next.goto);
    if (next.data) Object.assign(session.data, next.data);
    session.history.push(session.screen);
    session.screen = next.goto;
    return render(session, request);
  }

  function newSession(request: UssdRequest, now: number): Session {
    return {
      id: request.sessionId,
      phone: request.phone,
      serviceCode: request.serviceCode,
      screen: resolved.home,
      history: [],
      data: {},
      startedAt: now,
      updatedAt: now,
    };
  }

  async function finish(session: Session, response: UssdResponse): Promise<UssdResponse> {
    if (response.end) {
      await resolved.store.delete(session.id);
    } else {
      session.updatedAt = Date.now();
      await resolved.store.set(session, resolved.ttl);
    }
    return response;
  }

  const app: App = {
    options: resolved,
    screens,
    screen(id, screen) {
      if (screens.has(id)) {
        throw new UssdkitError(`Screen "${id}" is already registered`);
      }
      screens.set(id, screen);
      return app;
    },
    async handle(request) {
      if (!request.sessionId) {
        throw new UssdkitError(
          "Request has no sessionId",
          "Every gateway request must carry a session id",
        );
      }
      getScreen(resolved.home);

      let session = await resolved.store.get(request.sessionId);

      if (!session) {
        session = newSession(request, Date.now());
        const inputs = request.inputs ?? (request.input === "" ? [] : [request.input]);
        if (inputs.length === 0) {
          return finish(session, await render(session, request));
        }
        // No stored session but the gateway told us everything typed so far: replay it.
        let response: UssdResponse = { text: "", end: false };
        for (const input of inputs) {
          response = await step(session, request, input);
          if (response.end) break;
        }
        return finish(session, response);
      }

      return finish(session, await step(session, request, request.input));
    },
  };

  return app;
}
