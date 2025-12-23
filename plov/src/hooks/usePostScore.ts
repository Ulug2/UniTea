import { useEffect, useState } from 'react';
import { getPostScore } from '../utils/votes';

export function usePostScore(postId: string) {
    const [score, setScore] = useState(0);

    useEffect(() => {
        if (!postId) return;

        let isMounted = true;

        const load = async () => {
            const value = await getPostScore(postId);
            if (isMounted) setScore(value);
        };

        load();

        return () => {
            isMounted = false;
        };
    }, [postId]);

    return score;
}