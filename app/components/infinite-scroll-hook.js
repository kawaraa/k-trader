"use client";
import { useEffect, useRef } from "react";

export default function useInfiniteScroll({ onLoadContent, setLoading, ready }) {
  const itemsRef = useRef([]);
  const doneRef = useRef(false);

  const onRemoveItem = (index) => {
    itemsRef.current.splice(index, 1);
  };

  const fetchContent = async (prams) => {
    setLoading(true);
    const data = await onLoadContent(prams);
    if (prams) itemsRef.current = data || [];
    else if (data && data[0]) itemsRef.current = itemsRef.current.concat(data);
    else doneRef.current = true;
    setLoading(false);
  };

  const handleScrollEvent = async () => {
    const { scrollTop, offsetHeight } = document.documentElement;
    if (window.innerHeight + scrollTop !== offsetHeight || doneRef.current) return;
    await fetchContent();
  };

  useEffect(() => {
    if (ready) fetchContent();
  }, [ready]);

  useEffect(() => {
    window.addEventListener("scroll", handleScrollEvent);
    return () => window.removeEventListener("scroll", handleScrollEvent);
  }, []);

  return { data: itemsRef.current, removeItem: onRemoveItem, refresh: fetchContent };
}
