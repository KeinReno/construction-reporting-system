"""Local administrative bootstrap (not a public API).

Usage: python -m app.cli init-db
       python -m app.cli create-admin LOGIN
       python -m app.cli create-site NAME
       python -m app.cli grant LOGIN SITE_UUID
"""
import getpass, os, sys
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from app.main import Base, User, Site, Assignment, hash_password

def main():
    engine=create_engine(os.getenv('DATABASE_URL','sqlite:///./dev.db'))
    args=sys.argv[1:]
    if args==['init-db']:
        Base.metadata.create_all(engine)
        print('Schema created (development only; Alembic pending)')
        return
    with Session(engine) as db:
        if len(args)==2 and args[0]=='create-admin':
            if db.scalar(select(User).where(User.login==args[1])):raise SystemExit('User already exists')
            password=getpass.getpass('Admin password (min 12): ')
            if len(password)<12: raise SystemExit('Password too short')
            db.add(User(login=args[1],password_hash=hash_password(password),role='admin'))
        elif len(args)==2 and args[0]=='create-site':
            site=Site(name=args[1]);db.add(site);db.flush();print('SITE_UUID:',site.id)
        elif len(args)==3 and args[0]=='grant':
            user=db.scalar(select(User).where(User.login==args[1]));site=db.get(Site,args[2])
            if not user or not site:raise SystemExit('User/site not found')
            if db.scalar(select(Assignment).where(Assignment.user_id==user.id,Assignment.site_id==site.id)):
                raise SystemExit('Already granted')
            db.add(Assignment(user_id=user.id,site_id=site.id))
        else:raise SystemExit(__doc__)
        db.commit();print('OK')
if __name__=='__main__':main()
