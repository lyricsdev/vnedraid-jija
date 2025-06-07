export type AuthResponse = {
    token: string;
}

export type AuthDataset = {
    id: number,
    name: string,
    createdAt: string, 
    roles?: object[] 
}