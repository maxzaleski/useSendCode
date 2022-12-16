/**
MIT License

Copyright (c) 2022 Maximilien Zaleski

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

import React from 'react';

import { useTimer } from '@mzaleski/use-timer';

const DEFAULT_TIMER_DURATION = 5 * 60; // 5 minutes

/** EUseSendCodeStatus represents the possible status of `useSendCode`. */
export enum EUseSendCodeStatus {
  // The hook is attempting to restore the current session.
  RESTORING = 'RESTORING',
  // The hook is sending a new code.
  SENDING = 'SENDING',
  // The hook is in cool-down mode i.e., a code was recently sent.
  COOLDOWN = 'COOLDOWN',
  // The hook is ready to send a new code.
  READY = 'READY',
}

/** IUseSendCodeButtonProps represents the component properties of the user-facing CTA. */
export interface IUseSendCodeButtonProps extends Record<string, any> {
  children: string;
  disabled: boolean;
}

/** IUseSendCodeState represents the hook's exported state. */
export interface IUseSendCodeState {
  /** The current status. */
  status: EUseSendCodeStatus;
  /** Component properties of the user-facing CTA. */
  buttonProps: IUseSendCodeButtonProps;
  /**
   * The function responsible for sending a new code.
   *
   * @returns The server's cookie-creation timestamp if returned.
   */
  sendCode(): Promise<string | void>;
}

/** IUseSendCodeOptions represents the hook's configuration options. */
export interface IUseSendCodeOptions {
  /** The user for which the session was created. */
  iamIdentifier: string;
  /** The last code's iam identifier. */
  lastCodeIdentifier?: string;
  /** When the last code was sent. */
  lastCodeSentAt?: string;
  /** Whether to send a code on mount. */
  callOnMount?: boolean;
  /**
   * Cool-down period (in seconds) once a code has been sent.
   *
   * @default
   * 5 * 60 = 300 seconds or 5 minutes
   */
  cooldownPeriod?: number;
  /** Button label when a new code is ready to be sent. */
  buttonPropsActiveLabel?: string;
  /**
   * Override the button's property key for the `loading` boolean.
   *
   * @default
   * <Button loading={loading} />
   *
   * @example
   * <Button isLoading={loading} />
   */
  buttonPropsLoadingPropName?: string;
  /** When in development mode, log a table containing all relevant variables. */
  debugStatements?: boolean;
  /** Called to clear the session. */
  sessionClearHandler(): Promise<void>;
  /** Called to persist the session. */
  sessionPersistHandler(iamIdentifier: string): Promise<string | void>;
}

/**
 * useSendCode is a hook that handles the sending of temporary codes.
 *
 * @param fn - The worker i.e., the function responsible for sending the code.
 * @param opts - The configuration options.
 */
export function useSendCode(
  fn: (iamIdentifier: string) => Promise<void>,
  opts: IUseSendCodeOptions
) {
  const [secondsRemaining, setRemainingTime] = React.useState(
    opts.cooldownPeriod || DEFAULT_TIMER_DURATION
  );
  const [status, setStatus] = React.useState<EUseSendCodeStatus>(
    EUseSendCodeStatus.RESTORING
  );
  const { timeRemaining, isFrozen, setFreeze, resetTimer } = useTimer(
    secondsRemaining,
    true,
    async () => {
      if (status != EUseSendCodeStatus.READY) {
        // Clear the cookie.
        await opts.sessionClearHandler();
        // Reset the timer with the `freeze` flag.
        resetTimer(true);
        // Update the status.
        setStatus(EUseSendCodeStatus.READY);
      }
    }
  );

  React.useEffect(() => {
    (async () => {
      const { iamIdentifier, callOnMount } = opts;
      let { lastCodeSentAt, lastCodeIdentifier } = opts;

      // [case: new session on mount]
      if (
        callOnMount &&
        iamIdentifier &&
        !lastCodeIdentifier &&
        !lastCodeSentAt
      ) {
        // The user can choose to provide a server timestamp to ensure that the cookie is as
        // accurate as possible.
        lastCodeSentAt = (await sendCode()) || new Date().toISOString();
        lastCodeIdentifier = iamIdentifier;
      }
      // [case: existing session but inconsistent iam identifier]
      if (lastCodeIdentifier && lastCodeIdentifier != iamIdentifier) {
        await opts.sessionClearHandler();
        setStatus(EUseSendCodeStatus.READY);
      }
      // [case: restore state from existing session]
      else if (lastCodeSentAt && lastCodeIdentifier) {
        const diff =
          new Date().getTime() - parseLastCodeSentAt(lastCodeSentAt).getTime();
        const diffAsSeconds = diff / 1000;

        // Check if the last code was sent within the cool off period;
        // update the timer to reflect the remaining time.
        if (diffAsSeconds < secondsRemaining) {
          // Assign the remaining time.
          setRemainingTime(Math.round(secondsRemaining - diffAsSeconds));
          // Start the timer.
          setFreeze(false);
          setStatus(EUseSendCodeStatus.COOLDOWN);
        } else {
          // Clear the remnants of the previous session.
          await opts.sessionClearHandler();
          setStatus(EUseSendCodeStatus.READY);
        }
      } else {
        setStatus(EUseSendCodeStatus.READY);
      }
    })();
    // eslint-disable-next-line
  }, []);

  // Debugging statements.
  React.useEffect(() => {
    if (process.env.NODE_ENV != 'production' && opts.debugStatements) {
      console.info('[useSendCode] `opts.debugStatements` is enabled');
      console.table({
        status,
        iamIdentifier: opts.iamIdentifier,
        isFrozen,
        initialTime: secondsRemaining,
      });
    }
  }, [status, isFrozen]);

  const worker = React.useCallback(async () => {
    // Call worker.
    await fn(opts.iamIdentifier);
    // Persist session through the given handler.
    return await opts.sessionPersistHandler(opts.iamIdentifier);
  }, [fn, opts.sessionPersistHandler]);

  const sendCode = React.useCallback(async () => {
    setStatus(EUseSendCodeStatus.SENDING);
    try {
      // Call the worker and start the timer.
      const ts = await worker();
      resetTimer();
      // Notify the user that the code has been sent.
      setStatus(EUseSendCodeStatus.COOLDOWN);
      return ts;
    } catch (e: unknown) {
      setStatus(EUseSendCodeStatus.READY);
      throw e; // Must be handled by the user.
    }
  }, [worker, resetTimer, setStatus]);

  return {
    status,
    buttonProps: {
      children: getButtonLabelFromStatus(
        status,
        timeRemaining,
        opts.buttonPropsActiveLabel
      ),
      [opts.buttonPropsLoadingPropName ?? 'loading']:
        status === EUseSendCodeStatus.SENDING ||
        status === EUseSendCodeStatus.RESTORING,
      disabled: status != EUseSendCodeStatus.READY,
    },
    sendCode,
  } as IUseSendCodeState;
}

function getButtonLabelFromStatus(
  status: EUseSendCodeStatus,
  remaining: string,
  activeLabel = 'Send me a new code'
): string {
  switch (status) {
    case EUseSendCodeStatus.READY:
      return activeLabel;
    case EUseSendCodeStatus.COOLDOWN:
      return 'Next code available in ' + remaining;
    case EUseSendCodeStatus.SENDING:
      return 'Sending code...';
    case EUseSendCodeStatus.RESTORING:
      return 'Restoring session...';
  }
}

function parseLastCodeSentAt(lastCodeSentAt: string): Date {
  const date = new Date(lastCodeSentAt);
  if (isNaN(date.getTime())) {
    throw new Error(
      '[useSendCode] Invalid `lastCodeSentAt` value, expected parse-able date'
    );
  }
  return date;
}
