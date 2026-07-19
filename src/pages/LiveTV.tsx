import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Loader2, AlertCircle } from "lucide-react";
import { useAppStore } from "../store/useAppStore";
import { useGuide } from "../hooks/useIptv";
import { EpgGrid } from "../components/epg/EpgGrid";
import { ChannelPreview } from "../components/epg/ChannelPreview";
import { ProgrammeInfoBox } from "../components/epg/ProgrammeInfoBox";
import { nowNext, programmesFor } from "../iptv/guide";
import { Button } from "../components/Button";
import type { Channel, Programme } from "../iptv/types";

function Prompt({ title, body, cta, onCta }: { title: string; body: string; cta: string; onCta: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-surface p-12 text-center">
      <Radio size={32} className="text-accent" />
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="max-w-md text-sm text-muted">{body}</p>
      <Button onClick={onCta} className="mt-2">{cta}</Button>
    </div>
  );
}

export function LiveTV() {
  const navigate = useNavigate();
  const iptvEnabled = useAppStore((s) => s.iptvEnabled);
  const playlists = useAppStore((s) => s.iptvPlaylists);
  const { channels, epg, isLoading, isError } = useGuide();

  const [selected, setSelected] = useState<Channel | null>(null);
  const [selectedProg, setSelectedProg] = useState<{ p: Programme; c: Channel } | null>(null);

  useEffect(() => {
    if (!selected && channels.length) setSelected(channels[0]);
  }, [channels, selected]);

  // Info box shows the explicitly-picked programme, else the selected channel's current one.
  const currentProg = selected ? nowNext(programmesFor(epg, selected)).current : undefined;
  const infoProg = selectedProg ?? (selected && currentProg ? { p: currentProg, c: selected } : null);

  return (
    <div className="animate-fade-in px-4 pb-16 pt-24 sm:px-8">
      <div className="mb-5 flex items-center gap-3">
        <Radio className="text-accent" />
        <h1 className="text-3xl font-black tracking-tight">Live TV</h1>
        {channels.length > 0 && <span className="text-sm text-muted">{channels.length} channels</span>}
      </div>

      {!iptvEnabled ? (
        <Prompt
          title="Live TV is off"
          body="Enable IPTV in Settings, then add an M3U playlist and an XMLTV EPG to see your channels and TV guide here."
          cta="Open Settings"
          onCta={() => navigate("/settings")}
        />
      ) : playlists.length === 0 ? (
        <Prompt
          title="No playlists yet"
          body="Add an M3U playlist URL in Settings to load your channels. Add an XMLTV EPG too for the full TV guide."
          cta="Add a playlist"
          onCta={() => navigate("/settings")}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-3 py-20 text-muted">
          <Loader2 className="animate-spin" /> Loading channels…
        </div>
      ) : isError || channels.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-surface p-12 text-center">
          <AlertCircle size={28} className="text-yellow-400" />
          <h2 className="text-lg font-bold">Couldn't load channels</h2>
          <p className="max-w-md text-sm text-muted">
            The playlist didn't return any channels. It may be offline or block browser (CORS) requests — such playlists still work in the Android / desktop builds.
          </p>
          <Button variant="secondary" onClick={() => navigate("/settings")}>Check settings</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Top: selected-programme info (left) + channel preview (top-right) */}
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="order-2 min-w-0 flex-1 lg:order-1">
              <ProgrammeInfoBox
                programme={infoProg?.p ?? null}
                channelName={infoProg?.c.name}
                onWatch={infoProg ? () => navigate(`/live/watch/${encodeURIComponent(infoProg.c.id)}`) : undefined}
              />
            </div>
            <div className="order-1 lg:order-2 lg:w-96 lg:shrink-0">
              <ChannelPreview channel={selected} epg={epg} />
            </div>
          </div>

          {/* Full-width TV guide */}
          <EpgGrid
            channels={channels}
            epg={epg}
            selectedId={selected?.id}
            selectedProgKey={selectedProg ? `${selectedProg.c.id}:${selectedProg.p.start}` : undefined}
            onSelect={(c) => { setSelected(c); setSelectedProg(null); }}
            onOpenProgramme={(p, c) => setSelectedProg({ p, c })}
          />
        </div>
      )}
    </div>
  );
}
