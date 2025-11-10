import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { ArrowLeftIcon } from "@/components/ui/Icon";

export default function NotFound() {
  return (
    <div className="error-page">
      <div className="error-container">
        <div className="error-content">
          <h1 className="error-title">404</h1>
          <h2 className="error-subtitle">Page Not Found</h2>
          <p className="error-message">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="error-actions">
            <Button variant="primary" href="/">
              <ArrowLeftIcon size={16} />
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

