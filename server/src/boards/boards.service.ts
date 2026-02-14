import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { IssueStatus } from "../../generated/prisma/client";

const ORDER_STEP = 1000;

function normalizeOrders<T extends { id: string }>(items: T[]) {
  return items.map((it, idx) => ({
    id: it.id,
    order: (idx + 1) * ORDER_STEP,
  }));
}

@Injectable()
export class BoardsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.board.findMany({ orderBy: { createdAt: "asc" } });
  }

  create(name: string) {
    return this.prisma.board.create({ data: { name } });
  }

  listSprints(boardId: string) {
    return this.prisma.sprint.findMany({
      where: { boardId },
      orderBy: [{ isActive: "desc" }, { createdAt: "asc" }],
    });
  }

  async createSprint(
    boardId: string,
    args: { name: string; isActive?: boolean },
  ) {
    const isActive = !!args.isActive;

    const board = await this.prisma.board.findUnique({
      where: { id: boardId },
    });
    if (!board) throw new NotFoundException("Board not found");

    return this.prisma.$transaction(async (tx) => {
      if (isActive) {
        await tx.sprint.updateMany({
          where: { boardId, isActive: true },
          data: { isActive: false },
        });
      }
      return tx.sprint.create({
        data: { boardId, name: args.name, isActive },
      });
    });
  }

  async setActiveSprint(boardId: string, sprintId: string) {
    // ✅ ensure sprint belongs to board
    const sprint = await this.prisma.sprint.findFirst({
      where: { id: sprintId, boardId },
    });
    if (!sprint) throw new NotFoundException("Sprint not found for this board");

    return this.prisma.$transaction(async (tx) => {
      await tx.sprint.updateMany({
        where: { boardId, isActive: true },
        data: { isActive: false },
      });
      return tx.sprint.update({
        where: { id: sprintId },
        data: { isActive: true },
      });
    });
  }

  // moveIssue unchanged...
  async moveIssue(
    boardId: string,
    id: string,
    body: { sprintId: string | null; status?: string; order?: number },
  ) {
    const issue = await this.prisma.issue.findUnique({ where: { id } });
    if (!issue || issue.boardId !== boardId) {
      throw new NotFoundException("Issue not found");
    }

    const fromSprintId = issue.sprintId;
    const fromStatus = issue.status;

    const toSprintId = body.sprintId ?? null;

    const toStatus =
      (body.status as IssueStatus | undefined) ??
      (toSprintId ? IssueStatus.todo : IssueStatus.backlog);

    if (fromSprintId === toSprintId && fromStatus === toStatus) {
      return this.prisma.issue.findMany({
        where: { boardId, sprintId: toSprintId },
        orderBy: [{ status: "asc" }, { order: "asc" }],
      });
    }

    const [fromList, toList] = await Promise.all([
      this.prisma.issue.findMany({
        where: { boardId, sprintId: fromSprintId, status: fromStatus },
        orderBy: { order: "asc" },
      }),
      this.prisma.issue.findMany({
        where: { boardId, sprintId: toSprintId, status: toStatus },
        orderBy: { order: "asc" },
      }),
    ]);

    const fromWithout = fromList.filter((x) => x.id !== id);

    const toNext = [
      ...toList,
      { ...issue, sprintId: toSprintId, status: toStatus },
    ];

    const normalizedFrom = normalizeOrders(fromWithout);
    const normalizedTo = normalizeOrders(toNext);

    await this.prisma.$transaction([
      this.prisma.issue.update({
        where: { id },
        data: {
          sprintId: toSprintId,
          status: toStatus,
          order: normalizedTo.find((x) => x.id === id)!.order,
        },
      }),
      ...normalizedFrom.map((it) =>
        this.prisma.issue.update({
          where: { id: it.id },
          data: { order: it.order },
        }),
      ),
      ...normalizedTo
        .filter((it) => it.id !== id)
        .map((it) =>
          this.prisma.issue.update({
            where: { id: it.id },
            data: { order: it.order },
          }),
        ),
    ]);

    return this.prisma.issue.findMany({
      where: { boardId, sprintId: toSprintId },
      orderBy: [{ status: "asc" }, { order: "asc" }],
    });
  }
}
