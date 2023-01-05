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

/** EUseSendCodeStatus represents the possible status of `useSendCode`. */
export enum EUseSendCodeStatus {
  /** The hook is attempting to restore the current session. */
  RESTORING = 'RESTORING',
  /** The hook is sending a new code. */
  SENDING = 'SENDING',
  /** The hook has sent a code very recently. */
  COOLDOWN = 'COOLDOWN',
  /** The hook is ready to send a new code. */
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
   * The worker responsible for sending a new code.
   * 
   * /!\ This function is the callee's responsibility, please refer to the official example.
   *
   * @returns An error if encountered.
   */
  sendCode(): Promise<string | undefined>;
  /** reset will restore the hook to a "READY" state. */
  reset(): Promise<void>;
}

/** IUseSendCodeOptions represents the hook's configuration options. */
export interface IUseSendCodeOptions {
  /** The user for which the session was created. */
  iamIdentifier: string;
  /** [cookie->] The last code's iam identifier. */
  lastCodeIdentifier?: string;
  /** [cookie->] When the last code was sent. */
  lastCodeSentAt?: string | number;
  /** Whether to call `sendCode` on mount. */
  callOnMount?: boolean;
  /**
   * Cooldown period (in seconds) once a code has been sent.
   *
   * @default
   * 300 seconds (5 minutes)
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
  sessionPersistHandler(iamIdentifier: string): Promise<string | number | void>;
}

const DEFAULT_COOLDOWN = 5 * 60;
const DEFAULT_LOADING_PROP = 'loading';

/**
 * useSendCode is a hook that handles the sending of temporary codes.
 *
 * @param fn The function responsible for sending the code.
 * @param opts The configuration options.
 */
export function useSendCode(
  fn: (iamIdentifier: string) => Promise<void>,
  opts: IUseSendCodeOptions
) {
  const {
    sessionClearHandler,
    sessionPersistHandler,
    callOnMount,
    iamIdentifier,
  } = opts;
  // This implementation circumvents the preferred pattern of calling the setter within the
  // `useTimer` hook itself. However, the hook falls short by a single life-cycle tick resulting in
  // an erroneous time string to be displayed.
  const [secondsRemaining, setRemainingTime] = React.useState(
    opts.cooldownPeriod || DEFAULT_COOLDOWN
  );
  const [status, setStatus] = React.useState<EUseSendCodeStatus>(
    EUseSendCodeStatus.RESTORING
  );
  const { timeRemaining, isFrozen, setFreeze, resetTimer } = useTimer(
    secondsRemaining,
    true,
    async () => await reset()
  );

  React.useEffect(() => {
    (async () => {
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
        await sessionClearHandler();
        setStatus(EUseSendCodeStatus.READY);
      }
      // [case: restore state from existing session]
      else if (lastCodeSentAt && lastCodeIdentifier) {
        const lastCodeSentAtDate = parseLastCodeSentAt(lastCodeSentAt);
        const diff = new Date().getTime() - lastCodeSentAtDate.getTime();
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
          await sessionClearHandler();
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
        iamIdentifier,
        isFrozen,
        initialTime: secondsRemaining,
      });
    }
  }, [status, isFrozen, secondsRemaining]);

  const worker = React.useCallback(async () => {
    // Call worker.
    await fn(iamIdentifier);
    // Persist session through the given handler.
    return await sessionPersistHandler(iamIdentifier);
  }, [fn, sessionPersistHandler]);

  const sendCode = React.useCallback(async () => {
    setStatus(EUseSendCodeStatus.SENDING);
    try {
      // Call the worker and start the timer.
      await worker();
      resetTimer();
      // Notify the user that the code has been sent.
      setStatus(EUseSendCodeStatus.COOLDOWN);
    } catch (e: unknown) {
      setStatus(EUseSendCodeStatus.READY);
      return e instanceof Error ? e.message : 'An unknown error occurred.';
    }
  }, [worker, resetTimer]);

  const reset = React.useCallback(async () => {
    if (status != EUseSendCodeStatus.READY) {
      // Clear the cookie.
      await sessionClearHandler();
      // Reset the timer with the `freeze` flag.
      resetTimer(true);
      // Update the status.
      setStatus(EUseSendCodeStatus.READY);
    }
  }, [resetTimer, sessionClearHandler]);

  return {
    status,
    buttonProps: {
      children: getButtonChildren(
        status,
        timeRemaining,
        opts.buttonPropsActiveLabel
      ),
      [opts.buttonPropsLoadingPropName || DEFAULT_LOADING_PROP]:
        status === EUseSendCodeStatus.SENDING,
      disabled: status != EUseSendCodeStatus.READY,
    },
    sendCode,
    reset,
  } as IUseSendCodeState;
}

/** getButtonChildren returns the appropriate user-facing CTA label.  */
function getButtonChildren(
  status: EUseSendCodeStatus,
  remaining: string,
  readyLabel?: string
): string {
  switch (status) {
    case EUseSendCodeStatus.READY:
      return readyLabel || 'Send me a new code';
    case EUseSendCodeStatus.COOLDOWN:
      return 'Next code available in ' + remaining;
    case EUseSendCodeStatus.SENDING:
      return 'Sending code...';
    case EUseSendCodeStatus.RESTORING:
      return 'Restoring session...';
  }
}

/** InvalidLastCodeSentAtError is thrown when `lastCodeSentAt` is unparsable. */
export class InvalidLastCodeSentAtError extends Error {
  constructor() {
    super(
      '[useSendCode] Invalid `lastCodeSentAt` value, expected parsable date'
    );
    this.name = 'InvalidLastCodeSentAtError';
  }
}

/**
 * parseLastCodeSentAt is a utility function that will attempt to parse the given date input.
 *
 * @returns the parsed date.
 *
 * @throws {InvalidLastCodeSentAtError} if `input` is invalid. 
 */
export function parseLastCodeSentAt(input: string | number): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new InvalidLastCodeSentAtError();
  }
  return date;
}
