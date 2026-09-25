import { useState, useEffect } from 'react';

// True on phone-width screens (default <= 768px) and updates live on resize / rotation.
// Shared by list pages that swap their wide table for cards on a phone.
const useIsPhone = (bp = 768) => {
    const q = `(max-width:${bp}px)`;
    const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
    useEffect(() => {
        const mq = window.matchMedia(q);
        const on = e => setM(e.matches);
        mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
        return () => mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on);
    }, [q]);
    return m;
};

export default useIsPhone;
