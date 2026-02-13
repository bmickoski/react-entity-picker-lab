import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IssueStatus, Prisma } from "../../generated/prisma/client";

type GetIssuesArgs = { boardId: string; sprintId: string | null };

@Injectable()
export class IssuesService {
  constructor(private prisma: PrismaService) {}

  async list({ boardId, sprintId }: GetIssuesArgs) {
    return this.prisma.issue.findMany({
      where: {
        boardId,
        sprintId: sprintId ?? null,
      },
      orderBy: { order: "asc" },
    });
  }

  async create(input: {
    boardId: string;
    sprintId: string | null;
    title: string;
    description?: string;
    status: IssueStatus;
    order: number;
    assigneeId?: string | null;
    watcherIds?: string[];
  }) {
    const count = await this.prisma.issue.count({
      where: { boardId: input.boardId },
    });

    const key = `${input.boardId}-${count + 1}`;

    return this.prisma.issue.create({
      data: {
        boardId: input.boardId,
        sprintId: input.sprintId ?? null,
        key,
        title: input.title,
        description: input.description ?? "",
        status: input.status,
        order: input.order,
        assigneeId: input.assigneeId ?? null,
        watcherIds: input.watcherIds ?? [],
      },
    });
  }

  async patch(id: string, patch: any) {
    const existing = await this.prisma.issue.findUniqueOrThrow({
      where: { id },
    });

    const data: Prisma.IssueUpdateInput = {};

    if ("title" in patch) data.title = patch.title;
    if ("description" in patch) data.description = patch.description;
    if ("status" in patch) data.status = patch.status;
    if ("order" in patch) data.order = patch.order;
    if ("assigneeId" in patch) data.assigneeId = patch.assigneeId;
    if ("watcherIds" in patch) data.watcherIds = patch.watcherIds;

    if ("sprintId" in patch) {
      (data as any).sprintId = patch.sprintId;

      // moving BACK TO BACKLOG
      if (patch.sprintId === null) {
        data.status = IssueStatus.backlog;
      }
      // moving INTO sprint
      else if (existing.status === IssueStatus.backlog) {
        data.status = IssueStatus.todo;
      }
    }

    return this.prisma.issue.update({
      where: { id },
      data,
    });
  }

  // =========================
  // BATCH PATCH (DnD)
  // =========================
  async batchPatch(changes: Array<{ id: string; patch: any }>) {
    return this.prisma.$transaction(
      changes.map((c) =>
        this.prisma.issue.update({
          where: { id: c.id },
          data: this.buildBatchPatchData(c.patch),
        }),
      ),
    );
  }

  private buildBatchPatchData(patch: any): Prisma.IssueUpdateInput {
    const data: Prisma.IssueUpdateInput = {};

    if ("status" in patch) data.status = patch.status;
    if ("order" in patch) data.order = patch.order;
    if ("assigneeId" in patch) data.assigneeId = patch.assigneeId;
    if ("watcherIds" in patch) data.watcherIds = patch.watcherIds;

    if ("sprintId" in patch) {
      data.sprintId = patch.sprintId;

      if (patch.sprintId === null) {
        data.status = IssueStatus.backlog;
      } else {
        data.status = IssueStatus.todo;
      }
    }

    return data;
  }
}
