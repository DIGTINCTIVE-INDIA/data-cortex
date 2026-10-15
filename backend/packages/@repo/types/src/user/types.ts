export type CreateUserPayload = {
	fullName: string;
	email: string;
	role: UserRoleEnum;
};

export type UserRoleEnum = "admin" | "engineer" | "analyst" | "service";
