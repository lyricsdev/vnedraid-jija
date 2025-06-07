import { prisma } from "../prisma"

export const getProjectForUser = async (userId: string) => {
  const data = await prisma.user.findFirst({
    where: {
      userId,
    },
    include: {
      projects: {
        include: {
          project: true,
        },
      },
    },
  });

  if (!data) {
    return {
      code: 404,
      message: "Проектов нет",
    };
  }

  return {
    collection: data,
    code: 200,
  };
};
export const getClusterProjects = async (projectId: number) => {
  const data = await prisma.cluster.findMany({
    where: {
      projectId,
    }
  });

  if (!data) {
    return {
      code: 404,
      message: "кластеров нет",
    };
  }

  return {
    collection: data,
    code: 200,
  };
};
interface IcreateProject {
    name: string,
    userId: string,
    username: string
}
export const createProject = async (data: IcreateProject) => {
  const user = await prisma.user.upsert({
    where: { userId: data.userId },
    update: {},
    create: {
      userId: data.userId,
      username: data.username,
    },
  });

  return await prisma.project.create({
    data: {
      name: data.name,
      members: {
        create: {
          user: {
            connect: { id: user.id },
          },
        },
      },
    },
    select: {
      name: true,
      id: true,
      createdAt: true
    }
  });
};
