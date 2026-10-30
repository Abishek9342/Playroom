import { useEffect, useState } from 'react';
// Re-renders on an interval; `offset` corrects for the server's clock.
export function useNow(offset = 0, ms = 200) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now() + offset), ms);
    return () => clearInterval(t);
  }, [offset, ms]);
  return now;
}
