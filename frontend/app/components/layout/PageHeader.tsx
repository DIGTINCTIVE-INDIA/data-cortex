type PageHeaderProps = {
  title: string;
  description?: string;
};

const PageHeader = ({ title, description }: PageHeaderProps) => {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
};

export default PageHeader;
