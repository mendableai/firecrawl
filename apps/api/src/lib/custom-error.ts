export class CustomError extends Error {
  statusCode: number;
  status: string;
  message: string;
  dataIngestionJob: any;

  constructor(
    statusCode: number,
    status: string,
    message: string = "",
    dataIngestionJob?: any,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.status = status;
    this.message = message;
    this.dataIngestionJob = dataIngestionJob;

    Object.setPrototypeOf(this, CustomError.prototype);
  }
}
