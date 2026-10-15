const retryApi = (failureCount: number, error: any, retryCount: number = 2) => {
  if (retryCount == 0) return false;
  if (failureCount >= 2) return false;

  const status = error?.response?.status;

  if (status === 429) return false;
  if (status >= 400 && status < 500) return false;
  if (!status) return true;
  if (status >= 500) return true;

  return false;
};

export default retryApi;
