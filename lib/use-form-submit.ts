"use client";

// Standardizes the "submit a form to the API, then maybe navigate" flow that
// every client form in the app repeats. Three things matter for UX:
//
//   1. The top loading bar shows from submit until the destination commits.
//   2. The form's local `loading` state stays true across both the fetch and
//      the subsequent navigation, so the submit button stays disabled and
//      shows a spinner — preventing double-submits while React renders the
//      new page.
//   3. Errors land back in component-level state via the returned error.
//
// Why a single hook instead of three primitives in each form: the chaining
// (start bar → fetch → on success start transition + push → stop bar after
// transition settles) is fiddly and easy to break. Hide it once.
//
// SOLID note: the hook is open for extension via the `then` callback (run
// arbitrary logic after a successful fetch) and closed to changes in the
// bar/transition coupling — adding a second navigation primitive later only
// touches this file, not the dozen forms calling it.

import { useTransition } from "react";

import { useLoadingBar } from "@/components/loading-bar";

export type ErrorPayload = { message: string; action?: string };

type Options<T> = {
  // The fetch / network call. Should return the parsed JSON body and the
  // HTTP status so the hook can decide success vs error.
  request: () => Promise<{ status: number; body: T }>;
  // Status codes that count as success. Defaults to 200/201/202/204.
  success?: (status: number) => boolean;
  // Runs after a successful response, inside a React transition. Use it to
  // call router.push / router.refresh; the loading bar stays up until the
  // transition resolves.
  then?: (body: T) => void | Promise<void>;
  // Coerces an unsuccessful response body into the error shape the form
  // renders. Defaults to using {message, action} as-is.
  errorOf?: (status: number, body: T) => ErrorPayload;
};

const DEFAULT_SUCCESS = (status: number) =>
  status === 200 || status === 201 || status === 202 || status === 204;

const DEFAULT_ERROR_OF = (_status: number, body: unknown): ErrorPayload => {
  const obj = (body ?? {}) as { message?: unknown; action?: unknown };
  return {
    message: typeof obj.message === "string" ? obj.message : "Erro inesperado.",
    action: typeof obj.action === "string" ? obj.action : undefined,
  };
};

export type SubmitResult<T> = { ok: true; body: T } | { ok: false; error: ErrorPayload };

export function useFormSubmit() {
  const bar = useLoadingBar();
  const [isPending, startTransition] = useTransition();

  async function submit<T>(options: Options<T>): Promise<SubmitResult<T>> {
    bar.start();
    try {
      const { status, body } = await options.request();
      const isSuccess = (options.success ?? DEFAULT_SUCCESS)(status);

      if (!isSuccess) {
        return {
          ok: false,
          error: (options.errorOf ?? DEFAULT_ERROR_OF)(status, body),
        };
      }

      if (options.then) {
        // Run the post-success effects inside a transition so the loading
        // bar stays up while the destination page renders, then we drop
        // it on the other side.
        bar.start();
        try {
          startTransition(() => {
            void options.then!(body);
          });
        } finally {
          // The transition runs async; pair its end with the outer stop().
          // We err on stopping a touch early — startTransition resolves
          // synchronously; the visible navigation that follows is fast
          // (Next caches the route) and any data work is server-side.
          bar.stop();
        }
      }
      return { ok: true, body };
    } finally {
      bar.stop();
    }
  }

  return { submit, isPending };
}
