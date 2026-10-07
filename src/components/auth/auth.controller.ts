import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UploadedFile, UploadedFiles, UseGuards, UseInterceptors, } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dtos/login.dto';
import { AuthGuard } from '../../gaurd/auth.gaurd';
import { AuthUser } from '../../decorators/auth-user.decorater';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) { }

  @Post('send-otp')
  async sendOtp(@Body() body: { email: any }) {
    return await this.authService.sendOtp(body);
  }

  @Post('verify-otp')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async verifyOtp(@Body() body: { email: string; otp: string }, @UploadedFile() image: Express.Multer.File) {
    return await this.authService.verifyOtp(body.email, body.otp, image);
  }

  @Post('login')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async signIn(@Body() loginDto: LoginDto, @UploadedFile() image: Express.Multer.File) {
    return await this.authService.signIn(loginDto, image);
  }

  @UseGuards(AuthGuard)
  @Get('whoami')
  async whoami(@AuthUser() user: any) {
    return await this.authService.whoami(user);
  }

  @UseGuards(AuthGuard)
  @Get('all-users')
  async getAllUsers(
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('search') search?: string,
  ) {
    return await this.authService.getAllUsers({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      search,
    });
  }

  @UseGuards(AuthGuard)
  @Post('create-user')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async createUser(@Body() body: any, @UploadedFile() image: Express.Multer.File,) {
    return await this.authService.createUser(body, image);
  }

  @UseGuards(AuthGuard)
  @Post(':id/create-user-permissions')
  async createUserPermissions(@Body() body: any, @Param('id') id: number) {
    return await this.authService.createUserPermissions(body, id);
  }

  @UseGuards(AuthGuard)
  @Patch(':id/update-user')
  @UseInterceptors(
    FileInterceptor('image', {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50 MB
      },
    }),
  )
  async updateUser(@Body() body: any, @Param('id') id: string, @UploadedFile() image: Express.Multer.File,) {
    return await this.authService.updateUser(body, id, image);
  }

  @UseGuards(AuthGuard)
  @Get(':id/get-one-user-detailsById')
  async getOneUserDetailsById(@Param('id') id: string) {
    return await this.authService.getOneUserDetailsById(id);
  }
}
