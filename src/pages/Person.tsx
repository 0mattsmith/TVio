import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getPerson } from "../services/catalog";
import { PosterCard } from "../components/PosterCard";

export function Person() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ["person", id],
    queryFn: () => getPerson(Number(id)),
  });

  if (isLoading || !data) return <div className="skeleton h-screen w-full" />;

  return (
    <div className="animate-fade-in px-4 pt-24 sm:px-8">
      <button
        onClick={() => navigate(-1)}
        className="focusable mb-6 flex items-center gap-2 rounded-full bg-surface-2 px-4 py-2 text-sm font-semibold"
      >
        <ArrowLeft size={16} /> Back
      </button>

      <div className="flex flex-col gap-6 sm:flex-row">
        {data.profile && (
          <img src={data.profile} alt={data.name} className="w-40 shrink-0 rounded-xl shadow-card" />
        )}
        <div className="flex-1">
          <h1 className="text-4xl font-black tracking-tight">{data.name}</h1>
          <p className="mt-1 text-sm text-accent">{data.knownFor}</p>
          {data.biography && (
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/80 line-clamp-6">{data.biography}</p>
          )}
        </div>
      </div>

      <h2 className="mb-3 mt-10 text-xl font-bold">Known For</h2>
      <div className="no-scrollbar flex flex-wrap gap-2.5 pb-16">
        {data.credits.slice(0, 30).map((c) => (
          <PosterCard key={`${c.type}-${c.id}`} item={c} />
        ))}
      </div>
    </div>
  );
}
