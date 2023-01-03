import { renderHook, act } from '@testing-library/react-hooks';
import { EUseSendCodeStatus } from './index';
import { useSendCode } from '.';
import { InvalidLastCodeSentAtError, parseLastCodeSentAt } from './useSendCode';

const commonProps = {
  iamIdentifier: 'this-is-a-test-iam',
  freezeTimer: true,

  sessionClearHandler: async () => {},
  sessionPersistHandler: async () => {},
};
const fn = async () => {};

describe('init', () => {
  const fn = jest.fn();
  const opts = {
    ...commonProps,
    sessionClearHandler: jest.fn(),
    sessionPersistHandler: jest.fn(),
  };
  const { result } = renderHook(() => useSendCode(fn, opts));

  it('should set status to "READY"', () => {
    expect(result.current.status).toBe(EUseSendCodeStatus.READY);
  });

  it('should unset `buttonProps.disabled`', () => {
    expect(result.current.buttonProps.disabled).toBe(false);
  });

  it('should unset `buttonProps.loading`', () => {
    expect(result.current.buttonProps.loading).toBeFalsy();
  });

  it('should set `buttonProps.children` to default', () => {
    expect(result.current.buttonProps.children).toBe('Send me a new code');
  });

  it('should set `buttonProps.children` to `buttonPropsActiveLabel`', () => {
    const { result } = renderHook(() =>
      useSendCode(fn, {
        ...commonProps,
        buttonPropsActiveLabel: 'test',
      })
    );
    expect(result.current.buttonProps.children).toBe('test');
  });

  it('should not call any function', () => {
    expect(fn).not.toHaveBeenCalled();
    expect(opts.sessionClearHandler).not.toHaveBeenCalled();
    expect(opts.sessionPersistHandler).not.toHaveBeenCalled();
  });

  it('should log debug statements if `debugStatements` is set', () => {
    console.table = jest.fn();
    console.info = jest.fn();
    renderHook(() =>
      useSendCode(fn, {
        ...commonProps,
        debugStatements: true,
      })
    );

    expect(console.info).toHaveBeenCalledWith(
      '[useSendCode] `opts.debugStatements` is enabled'
    );
    expect(console.table).toHaveBeenCalledWith({
      status: EUseSendCodeStatus.RESTORING,
      iamIdentifier: commonProps.iamIdentifier,
      isFrozen: true,
      initialTime: 300,
    });
  });
});

describe('restoring existing session', () => {
  it('should tick down', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, {
        ...commonProps,
        cooldownPeriod: 3,
        lastCodeIdentifier: commonProps.iamIdentifier,
        lastCodeSentAt: new Date().toISOString(),
      })
    );
    for (let i = 3; i > 0; i--) {
      expect(result.current.buttonProps.children).toBe(
        'Next code available in 00:' + (i < 10 ? '0' + i : i)
      );
      await waitForNextUpdate();
    }
  });

  it('should remove remnants of expired session', async () => {
    const opts = {
      ...commonProps,
      cooldownPeriod: 1,
      lastCodeIdentifier: commonProps.iamIdentifier,
      lastCodeSentAt: new Date(new Date().getTime() - 5000).toISOString(),
      sessionClearHandler: jest.fn(),
      sessionPersistHandler: jest.fn(),
    };
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, opts)
    );
    await waitForNextUpdate();

    expect(result.current.status).toBe(EUseSendCodeStatus.READY);
    expect(opts.sessionClearHandler).toBeCalledTimes(1);
    expect(opts.sessionPersistHandler).toBeCalledTimes(0);
  });

  it('should remove remnants of corrupted session', async () => {
    const opts = {
      ...commonProps,
      lastCodeIdentifier: 'corrupted-iam',
      lastCodeSentAt: new Date().toISOString(),
      sessionClearHandler: jest.fn(),
    };
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, opts)
    );
    await waitForNextUpdate();

    expect(result.current.status).toBe(EUseSendCodeStatus.READY);
    expect(opts.sessionClearHandler).toBeCalledTimes(1);
  });

  it('should throw error on invalid `lastCodeSendAt`', async () => {
    expect(() => parseLastCodeSentAt('invalid')).toThrow(
      InvalidLastCodeSentAtError
    );
  });

  it('should parse a valid `lastCodeSendAt` (ISO string)', () => {
    expect(() =>
      parseLastCodeSentAt(new Date().toISOString())
    ).not.toThrowError(InvalidLastCodeSentAtError);
  });

  it('should parse a valid `lastCodeSendAt` (number)', () => {
    expect(() => parseLastCodeSentAt(new Date().getTime())).not.toThrowError(
      InvalidLastCodeSentAtError
    );
  });
});

describe('cooldown', () => {
  const { result } = renderHook(() =>
    useSendCode(fn, {
      ...commonProps,
      lastCodeIdentifier: commonProps.iamIdentifier,
      lastCodeSentAt: new Date().toISOString(),
    })
  );

  it('should set status to "COOLDOWN"', () => {
    expect(result.current.status).toBe(EUseSendCodeStatus.COOLDOWN);
  });

  it('should unset `buttonProps.disabled`', () => {
    expect(result.current.buttonProps.disabled).toBe(true);
  });

  it('should unset `buttonProps.loading`', () => {
    expect(result.current.buttonProps.loading).toBeFalsy();
  });

  it('should set `buttonProps.children`', () => {
    expect(result.current.buttonProps.children).toBe(
      'Next code available in 05:00'
    );
  });

  it('should set status to "COOLDOWN" after `callOnMount`', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, {
        ...commonProps,
        callOnMount: true,
      })
    );
    await waitForNextUpdate();
    expect(result.current.status).toBe(EUseSendCodeStatus.COOLDOWN);
  });

  it('should set status to "READY" on completion', async () => {
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, { ...commonProps, cooldownPeriod: 1 })
    );
    await act(async () => result.current.sendCode() as Promise<void>);
    await waitForNextUpdate();
    expect(result.current.status).toBe(EUseSendCodeStatus.READY);
  });
});

describe('sending code', () => {
  // Ignore verbose error about async `act` calls as the point is to test during the async call.
  console.error = jest.fn();

  it('should set status to "SENDING"', async () => {
    const fn = jest.fn();
    const { result } = renderHook(() => useSendCode(fn, commonProps));
    act(() => {
      result.current.sendCode();
    });

    expect(fn).toBeCalledTimes(1);
    expect(result.current.status).toBe(EUseSendCodeStatus.SENDING);
  });

  it('should mutate button props', async () => {
    const { result } = renderHook(() => useSendCode(fn, commonProps));
    act(() => {
      result.current.sendCode();
    });

    expect(result.current.buttonProps.disabled).toBe(true);
    expect(result.current.buttonProps.loading).toBe(true);
    expect(result.current.buttonProps.children).toBe('Sending code...');
  });

  it('should set status to "COOLDOWN" and call session handlers', async () => {
    const opts = {
      ...commonProps,
      sessionClearHandler: jest.fn(),
      sessionPersistHandler: jest.fn(),
    };
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, opts)
    );
    await act(async () => result.current.sendCode() as Promise<void>);
    await waitForNextUpdate();

    expect(result.current.status).toBe(EUseSendCodeStatus.COOLDOWN);
    expect(opts.sessionClearHandler).toBeCalledTimes(0);
    expect(opts.sessionPersistHandler).toBeCalledTimes(1);
  });

  it('should call worker when `callOnMount` is set', async () => {
    const fn = jest.fn();
    const { waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, {
        ...commonProps,
        callOnMount: true,
      })
    );
    await waitForNextUpdate();
    expect(fn).toBeCalledTimes(1);
  });

  it('should return `sendCode` error', async () => {
    const fn = jest.fn(async () => {
      throw new Error('Test');
    });
    const { result } = renderHook(() => useSendCode(fn, commonProps));
    expect(await result.current.sendCode()).toEqual('Test');
  });
});

describe('timer', () => {
  it('should reset when completed', async () => {
    const opts = {
      ...commonProps,
      cooldownPeriod: 1,
      sessionClearHandler: jest.fn(),
    };
    const { result, waitForNextUpdate } = renderHook(() =>
      useSendCode(fn, opts)
    );
    await act(async () => result.current.sendCode() as Promise<void>);
    await waitForNextUpdate();

    expect(result.current.status).toBe(EUseSendCodeStatus.READY);
    expect(opts.sessionClearHandler).toBeCalledTimes(1);
  });
});
