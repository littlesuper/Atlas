import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

const ProjectEditRedirect: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const target = id ? `/projects?edit=${id}` : '/projects?new=1';
  return <Navigate to={target} replace />;
};

export default ProjectEditRedirect;
