import { ProjectFavicon, type ProjectFaviconProject } from "~/components/ProjectFavicon";

export function hasTitleFirstProjectLabel(
  project: ProjectFaviconProject | null,
  projectDisplayName: string | null,
): boolean {
  return project !== null || Boolean(projectDisplayName);
}

export function TitleFirstProjectLabel(props: {
  project: ProjectFaviconProject | null;
  projectDisplayName: string | null;
  separated: boolean;
}) {
  if (!hasTitleFirstProjectLabel(props.project, props.projectDisplayName)) return null;
  return (
    <>
      {props.project ? (
        <ProjectFavicon project={props.project} className="size-3.5 shrink-0" />
      ) : null}
      {props.projectDisplayName ? (
        <span className="max-w-[40%] shrink-0 truncate">{props.projectDisplayName}</span>
      ) : null}
      {props.separated ? (
        <span aria-hidden className="shrink-0 text-muted-foreground">
          ·
        </span>
      ) : null}
    </>
  );
}
