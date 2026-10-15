import {
	AccessRepo,
	AnalyseWorkstreamRepo,
	CustomSqlCheckRepo,
	DashboardRepo,
	DbConnectionRepo,
	DBExplorerRepo,
	FileConnectionRepo,
	IdGenerationRepo,
	JobsRepo,
	LibrariesRepo,
	NotificationsRepo,
	QCDBConfigurationRepo,
	QCFileConfigurationRepo,
	ReportsRepo,
	SSORepo,
	UserRepo,
} from "@repo/dao";
import { SessionFactory } from "@repo/lib";

const accessRepo = new AccessRepo();
const ssoRepo = new SSORepo();
const sessionRepo = SessionFactory("pgSession");
const userRepo = new UserRepo(ssoRepo, sessionRepo);
const idGenerationRepo = new IdGenerationRepo();
const dbConnectionRepo = new DbConnectionRepo(idGenerationRepo);
const fileConnectionRepo = new FileConnectionRepo(idGenerationRepo);
const librariesRepo = new LibrariesRepo();
const jobsRepo = new JobsRepo();
const notificationsRepo = new NotificationsRepo(idGenerationRepo);
const qcFileConfigRepo = new QCFileConfigurationRepo(idGenerationRepo);
const qcDBConfigRepo = new QCDBConfigurationRepo(idGenerationRepo);
const customSqlCheckRepo = new CustomSqlCheckRepo(new IdGenerationRepo());
const dbExplorerRepo = new DBExplorerRepo();
const reportsRepo = new ReportsRepo();
const dashboardRepo = new DashboardRepo();
const analyseWorkstreamRepo = new AnalyseWorkstreamRepo();

export const registry = {
	accessRepo,
	userRepo,
	sessionRepo,
	dbConnectionRepo,
	fileConnectionRepo,
	librariesRepo,
	jobsRepo,
	notificationsRepo,
	qcFileConfigRepo,
	qcDBConfigRepo,
	idGenerationRepo,
	customSqlCheckRepo,
	dbExplorerRepo,
	reportsRepo,
	dashboardRepo,
	analyseWorkstreamRepo,
};
