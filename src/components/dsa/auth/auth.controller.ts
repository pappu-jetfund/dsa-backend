import { Body, Controller, Post, InternalServerErrorException, HttpException, } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto, OtpLoginDto, VerifyOtpDto } from './auth.dto';

@Controller('dsa/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  // Email + Password
  @Post('login')
  async login(@Body() dto: LoginDto) {
    try {
      return await this.authService.login(dto.email, dto.password);
    } catch (error: any) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException(
        error.message || 'Login failed',
      );
    }
  }

  // Send OTP
  @Post('send-otp')
  async sendOtp(@Body() dto: OtpLoginDto) {
    try {
      return await this.authService.sendOtp(dto.email);
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'Failed to send OTP',
      );
    }
  }

  // Verify OTP
  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    try {
      return await this.authService.verifyOtp(dto.email, dto.otp);
    } catch (error: any) {
      throw new InternalServerErrorException(
        error.message || 'OTP verification failed',
      );
    }
  }
}