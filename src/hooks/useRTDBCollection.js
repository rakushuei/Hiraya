import { useState, useEffect } from 'react';
import { rtdb } from '../lib/firebase';
import { ref, onValue, off } from 'firebase/database';

export function useRTDBCollection(path) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const dbRef = ref(rtdb, path);
    const unsubscribe = onValue(
      dbRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val) {
          // If it's an object (keyed by IDs), convert to array
          const list = Object.entries(val).map(([id, item]) => ({
            id,
            ...(typeof item === 'object' ? item : { value: item })
          }));
          setData(list);
        } else {
          setData([]);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [path]);

  return { data, loading, error };
}
