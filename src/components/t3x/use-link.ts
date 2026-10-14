import { useCallback, useEffect, useRef, useState } from "react";
import { readIdentity } from "@/lib/net/identity";
import { linkSignature, readLink, watchLink } from "@/lib/net/link";
import { pushJournal, pushPing } from "@/lib/net/memory";
import { readPhone, samplePath, type PathSample, type PhoneFacts } from "@/lib/net/phone";
import type { LinkReading, NatReport, NetIdentity } from "@/lib/net/types";
import { probeNat } from "@/lib/net/webrtc";

export type LinkModel = {
  link: LinkReading | null;
  identity: NetIdentity | null;
  nat: NatReport | null;
  path: PathSample | null;
  phone: PhoneFacts | null;
  reading: boolean;
  error: string;
  zone: string;
  refresh: () => void;
};

export function useLink(): LinkModel {
  const [link, setLink] = useState<LinkReading | null>(null);
  const [identity, setIdentity] = useState<NetIdentity | null>(null);
  const [nat, setNat] = useState<NatReport | null>(null);
  const [path, setPath] = useState<PathSample | null>(null);
  const [phone, setPhone] = useState<PhoneFacts | null>(null);
  const [reading, setReading] = useState(true);
  const [error, setError] = useState("");
  const [zone, setZone] = useState("");
  const flight = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    flight.current?.abort();
    const controller = new AbortController();
    flight.current = controller;
    setReading(true);
    setError("");
    setLink(readLink());
    samplePath(controller.signal)
      .then((sample) => {
        if (!controller.signal.aborted) {
          setPath(sample);
          pushPing(sample.pingMs);
        }
      })
      .catch(() => {
        /* identity error is the one we surface */
      });
    readIdentity(controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setIdentity(next);
        setReading(false);
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Could not read the public path.");
        setReading(false);
      });
  }, []);

  useEffect(() => {
    refresh();
    setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    void readPhone().then(setPhone);
    const current = readLink();
    pushJournal(
      `${current.online ? "Link up" : "Link down"} · ${current.typeLabel} · ${current.effectiveLabel}`,
    );
    const stop = watchLink(() => {
      const next = readLink();
      setLink((prev) => {
        if (!prev || linkSignature(prev) !== linkSignature(next)) {
          pushJournal(
            `${next.online ? "Link changed" : "Link down"} · ${next.typeLabel} · ${next.effectiveLabel}`,
          );
        }
        return next;
      });
    });
    let cancel = false;
    probeNat().then((report) => {
      if (!cancel) setNat(report);
    });
    return () => {
      cancel = true;
      flight.current?.abort();
      stop();
    };
  }, [refresh]);

  return { link, identity, nat, path, phone, reading, error, zone, refresh };
}
